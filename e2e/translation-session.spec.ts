import { chromium, expect, test, type Page, type Worker } from '@playwright/test'
import { createServer, type ServerResponse } from 'node:http'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

const builtExtensionPath = path.resolve(
  process.env.PLAYWRIGHT_EXTENSION_DIR ?? 'apps/extension/output/chrome-mv3',
)

test('a translation session survives popup close and cancels without rendering late results', async () => {
  const fixture = await startTranslationSessionServer()
  const extension = await launchExtension()

  try {
    await configureProvider(extension, fixture.cancelProviderBaseUrl)

    const article = await extension.context.newPage()
    await article.goto(fixture.cancelArticleUrl)

    const startPopup = await extension.context.newPage()
    await startPopup.goto(extension.url('popup.html'))
    await article.bringToFront()

    const popupClosed = startPopup.waitForEvent('close')
    await startPopup.getByRole('button', { name: 'Translate to Japanese' }).click()
    await popupClosed

    await expect.poll(() => fixture.requestsFor('/cancel/v1/chat/completions').length, {
      timeout: 5_000,
    }).toBe(2)
    await expect.poll(() => article.locator('[data-lingoflow-translation]').count(), {
      timeout: 5_000,
    }).toBeGreaterThan(0)

    const retainedTranslationCount = await article.locator('[data-lingoflow-translation]').count()
    const translating = await pageStatus(extension.worker, fixture.cancelArticleUrl)
    expect(translating).toMatchObject({
      status: 'translating',
      translatedBlocks: retainedTranslationCount,
    })
    expect(translating.sessionId).toEqual(expect.any(String))

    const resumedPopup = await extension.context.newPage()
    await article.bringToFront()
    await resumedPopup.goto(extension.url('popup.html'))
    await expect(resumedPopup.locator('.status')).toHaveText('Translating')
    await expect(resumedPopup.getByRole('button', { name: 'Stop translation' })).toBeVisible()

    const stopButton = resumedPopup.getByRole('button', { name: 'Stop translation' })
    const status = resumedPopup.locator('.status')
    await stopButton.evaluate((button, expectedStatus) => {
      const statusElement = document.querySelector<HTMLElement>('.status')
      if (!statusElement) throw new Error('Popup status element is unavailable.')

      let clickStartedAt: number | undefined
      const recordLatency = () => {
        if (
          clickStartedAt === undefined ||
          statusElement.textContent?.trim() !== expectedStatus
        ) {
          return
        }
        statusElement.dataset.cancelLatencyMs = String(performance.now() - clickStartedAt)
        observer.disconnect()
      }
      const observer = new MutationObserver(recordLatency)
      observer.observe(statusElement, {
        characterData: true,
        childList: true,
        subtree: true,
      })
      button.addEventListener('click', () => {
        clickStartedAt = performance.now()
        recordLatency()
      }, { capture: true, once: true })
    }, 'Translation cancelled')

    await stopButton.click()
    await expect(status).toHaveText('Translation cancelled')
    await expect(status).toHaveAttribute('data-cancel-latency-ms', /^\d+(?:\.\d+)?$/)
    const cancelLatencyMs = Number(await status.getAttribute('data-cancel-latency-ms'))
    expect(cancelLatencyMs).toBeGreaterThanOrEqual(0)
    expect(cancelLatencyMs).toBeLessThanOrEqual(300)

    const cancelled = await pageStatus(extension.worker, fixture.cancelArticleUrl)
    expect(cancelled).toMatchObject({
      status: 'cancelled',
      sessionId: translating.sessionId,
    })
    expect(cancelled.translatedBlocks).toBeGreaterThanOrEqual(retainedTranslationCount)
    expect(cancelled.cancelledBlocks).toBeGreaterThan(0)

    await expect(article.locator('.lingoflow-loading')).toHaveCount(0)
    await expect(article.locator('[data-lingoflow-translation]')).toHaveCount(cancelled.translatedBlocks)

    const requestCountAtCancellation = fixture.requestsFor('/cancel/v1/chat/completions').length
    expect(requestCountAtCancellation).toBe(2)
    await expect.poll(() => {
      const pendingRequest = fixture.requestsFor('/cancel/v1/chat/completions')[1]
      return pendingRequest?.aborted || pendingRequest?.connectionClosedBeforeResponse
    }, {
      timeout: 2_000,
    }).toBe(true)

    await article.waitForTimeout(1_200)
    expect(fixture.requestsFor('/cancel/v1/chat/completions')).toHaveLength(requestCountAtCancellation)
    await expect(article.locator('[data-lingoflow-translation]')).toHaveCount(cancelled.translatedBlocks)
    await expect(article.getByText(/LATE_CANCEL:/)).toHaveCount(0)
    await expect(article.locator('.lingoflow-loading')).toHaveCount(0)
  } finally {
    await extension.close()
    await fixture.close()
  }
})

test('cancelling one tab does not cancel or overwrite another tab session', async () => {
  const fixture = await startTranslationSessionServer()
  const extension = await launchExtension()

  try {
    await configureProvider(extension, fixture.multiTabProviderBaseUrl)

    const tabA = await extension.context.newPage()
    const tabB = await extension.context.newPage()
    await tabA.goto(fixture.tabAUrl)
    await tabB.goto(fixture.tabBUrl)

    const [tabAId, tabBId] = await Promise.all([
      findTabId(extension.worker, fixture.tabAUrl),
      findTabId(extension.worker, fixture.tabBUrl),
    ])
    await injectRuntime(extension.worker, tabAId)
    await injectRuntime(extension.worker, tabBId)

    const [startedA, startedB] = await Promise.all([
      sendTabMessage(extension.worker, tabAId, {
        type: 'page/startTranslation',
        payload: { targetLang: 'ja' },
      }),
      sendTabMessage(extension.worker, tabBId, {
        type: 'page/startTranslation',
        payload: { targetLang: 'ja' },
      }),
    ])
    expect(startedA.data.sessionId).toEqual(expect.any(String))
    expect(startedB.data.sessionId).toEqual(expect.any(String))
    expect(startedA.data.sessionId).not.toBe(startedB.data.sessionId)

    await expect.poll(() => fixture.requestsFor('/multi/v1/chat/completions').length).toBe(2)
    const translatingB = await sendTabMessage(extension.worker, tabBId, {
      type: 'page/status',
    })
    expect(translatingB.data).toMatchObject({
      status: 'translating',
      sessionId: startedB.data.sessionId,
    })

    const cancelledA = await sendTabMessage(extension.worker, tabAId, {
      type: 'page/cancelTranslation',
    })
    expect(cancelledA).toMatchObject({
      ok: true,
      data: {
        status: 'cancelled',
        sessionId: startedA.data.sessionId,
      },
    })
    const stillTranslatingB = await sendTabMessage(extension.worker, tabBId, {
      type: 'page/status',
    })
    expect(stillTranslatingB.data).toMatchObject({
      status: 'translating',
      sessionId: startedB.data.sessionId,
    })
    const tabBRequest = fixture
      .requestsFor('/multi/v1/chat/completions')
      .find(request => request.texts.some(text => text.includes('TAB_B')))
    expect(tabBRequest).toMatchObject({
      aborted: false,
      connectionClosedBeforeResponse: false,
      completed: false,
    })
    fixture.releaseTabB()

    await expect.poll(async () => {
      const status = await sendTabMessage(extension.worker, tabBId, { type: 'page/status' })
      return status.data.status
    }, {
      timeout: 3_000,
    }).toBe('done')

    const [finalA, finalB] = await Promise.all([
      sendTabMessage(extension.worker, tabAId, { type: 'page/status' }),
      sendTabMessage(extension.worker, tabBId, { type: 'page/status' }),
    ])
    expect(finalA.data).toMatchObject({
      status: 'cancelled',
      sessionId: startedA.data.sessionId,
    })
    expect(finalB.data).toMatchObject({
      status: 'done',
      sessionId: startedB.data.sessionId,
      failedBlocks: 0,
    })

    await expect(tabB.locator('[data-lingoflow-translation]')).toHaveCount(finalB.data.totalBlocks)
    await expect(tabB.getByText(/TAB_B_OK:/).first()).toBeVisible()
    await tabA.waitForTimeout(1_000)
    await expect(tabA.getByText(/TAB_A_LATE:/)).toHaveCount(0)
    await expect(tabA.locator('.lingoflow-loading')).toHaveCount(0)
  } finally {
    await extension.close()
    await fixture.close()
  }
})

test('retry failed translations requests only failed blocks and preserves successful translations', async () => {
  const fixture = await startTranslationSessionServer()
  const extension = await launchExtension()

  try {
    await configureProvider(extension, fixture.retryProviderBaseUrl)

    const article = await extension.context.newPage()
    await article.goto(fixture.retryArticleUrl)
    const tabId = await findTabId(extension.worker, fixture.retryArticleUrl)
    await injectRuntime(extension.worker, tabId)

    const first = await sendTabMessage(extension.worker, tabId, {
      type: 'page/translate',
      payload: { targetLang: 'ja' },
    })
    expect(first).toMatchObject({
      ok: true,
      data: {
        status: 'partial',
        failedBlocks: 1,
        retryableBlocks: 1,
      },
    })
    expect(first.data.sessionId).toEqual(expect.any(String))

    const successfulTranslations = await article
      .locator('[data-lingoflow-translation]')
      .allTextContents()
    expect(successfulTranslations).toHaveLength(first.data.translatedBlocks)
    expect(successfulTranslations.length).toBeGreaterThan(0)
    await expect(article.locator('.lingoflow-loading')).toHaveCount(0)

    const requestCheckpoint = fixture.requestsFor('/retry/v1/chat/completions').length
    fixture.allowRetryRecovery()

    const popup = await extension.context.newPage()
    await article.bringToFront()
    await popup.goto(extension.url('popup.html'))
    await expect(popup.locator('.status')).toHaveText('Some content could not be translated')

    const retryButton = popup.getByRole('button', { name: /Retry failed/ })
    await expect(retryButton).toBeVisible()
    const popupClosed = popup.waitForEvent('close')
    await retryButton.click()
    await popupClosed

    for (const translatedText of successfulTranslations) {
      await expect(article.getByText(translatedText, { exact: true })).toBeVisible()
    }

    const retryingPopup = await extension.context.newPage()
    await article.bringToFront()
    await retryingPopup.goto(extension.url('popup.html'))
    await expect(retryingPopup.locator('.status')).toHaveText('Translating')

    await expect.poll(async () => {
      const status = await sendTabMessage(extension.worker, tabId, { type: 'page/status' })
      return status.data.status
    }, {
      timeout: 3_000,
    }).toBe('done')
    await expect(retryingPopup.locator('.status')).toHaveText('Translation complete')

    const completed = await sendTabMessage(extension.worker, tabId, { type: 'page/status' })
    expect(completed.data).toMatchObject({
      status: 'done',
      failedBlocks: 0,
      retryableBlocks: 0,
      translatedBlocks: first.data.totalBlocks,
    })
    expect(completed.data.sessionId).not.toBe(first.data.sessionId)

    const retryRequests = fixture
      .requestsFor('/retry/v1/chat/completions')
      .slice(requestCheckpoint)
    expect(retryRequests).toHaveLength(1)
    expect(retryRequests[0].texts).toHaveLength(1)
    expect(retryRequests[0].texts[0]).toContain('FAIL_ONCE')

    await expect(article.locator('[data-lingoflow-translation]')).toHaveCount(first.data.totalBlocks)
    await expect(article.locator('.lingoflow-loading, .lingoflow-error')).toHaveCount(0)
  } finally {
    await extension.close()
    await fixture.close()
  }
})

type ExtensionHarness = Awaited<ReturnType<typeof launchExtension>>

type RecordedProviderRequest = {
  id: number
  path: string
  texts: string[]
  aborted: boolean
  connectionClosedBeforeResponse: boolean
  completed: boolean
}

async function configureProvider(extension: ExtensionHarness, providerBaseUrl: string) {
  const setup = await extension.context.newPage()
  await setup.goto(extension.url('options.html'))
  const result = await setup.evaluate(async baseUrl => {
    const current = await chrome.runtime.sendMessage({ type: 'settings/get' })
    if (!current?.ok) return current

    return chrome.runtime.sendMessage({
      type: 'settings/save',
      payload: {
        settings: {
          ...current.data,
          targetLang: 'ja',
          cacheEnabled: false,
          translationConcurrency: 1,
          defaultProviderId: 'openai-compatible',
          fallbackProviderId: '',
          providers: {
            ...current.data.providers,
            'openai-compatible': {
              ...current.data.providers['openai-compatible'],
              values: {
                baseUrl,
                apiKey: 'test-only-key',
                model: 'test-model',
              },
            },
          },
        },
      },
    })
  }, providerBaseUrl)
  expect(result).toMatchObject({ ok: true })
  await setup.close()
}

async function pageStatus(worker: Worker, url: string) {
  const tabId = await findTabId(worker, url)
  const response = await sendTabMessage(worker, tabId, { type: 'page/status' })
  expect(response).toMatchObject({ ok: true })
  return response.data
}

async function findTabId(worker: Worker, expectedUrl: string): Promise<number> {
  const tabId = await worker.evaluate(async url => {
    const tabs = await chrome.tabs.query({})
    return tabs.find(tab => tab.url === url)?.id
  }, expectedUrl)
  if (tabId === undefined) throw new Error(`No extension tab found for ${expectedUrl}`)
  return tabId
}

async function injectRuntime(worker: Worker, tabId: number) {
  await worker.evaluate(async id => {
    await chrome.scripting.executeScript({
      target: { tabId: id },
      files: ['lingoflow-content.js'],
    })
  }, tabId)
}

async function sendTabMessage(worker: Worker, tabId: number, message: unknown): Promise<any> {
  return worker.evaluate(async ({ id, payload }) => chrome.tabs.sendMessage(id, payload), {
    id: tabId,
    payload: message,
  })
}

async function launchExtension() {
  const extensionDir = prepareTestExtensionDir()
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'lingoflow-session-e2e-'))
  const executablePath = process.env.PLAYWRIGHT_EXTENSION_EXECUTABLE_PATH
  const brandedBrowser = Boolean(executablePath)
  const context = await chromium.launchPersistentContext(userDataDir, {
    ...(executablePath
      ? { executablePath }
      : { channel: process.env.PLAYWRIGHT_EXTENSION_CHANNEL ?? 'chromium' }),
    headless: true,
    ignoreDefaultArgs: brandedBrowser ? ['--disable-extensions'] : undefined,
    args: brandedBrowser
      ? ['--enable-unsafe-extension-debugging']
      : [
          `--disable-extensions-except=${extensionDir}`,
          `--load-extension=${extensionDir}`,
        ],
  })

  if (brandedBrowser) {
    const browser = context.browser()
    if (!browser) throw new Error('Branded browser instance is unavailable.')
    const session = await browser.newBrowserCDPSession()
    try {
      await session.send('Extensions.loadUnpacked', { path: extensionDir })
    } finally {
      await session.detach()
    }
  }

  let [worker] = context.serviceWorkers()
  if (!worker) worker = await context.waitForEvent('serviceworker')
  const extensionId = new URL(worker.url()).host

  return {
    context,
    worker,
    url: (file: string) => `chrome-extension://${extensionId}/${file}`,
    close: async () => {
      await context.close()
      await rm(userDataDir, { recursive: true, force: true })
      rmSync(extensionDir, { recursive: true, force: true })
    },
  }
}

function prepareTestExtensionDir(): string {
  const extensionDir = mkdtempSync(path.join(os.tmpdir(), 'lingoflow-session-ext-'))
  cpSync(builtExtensionPath, extensionDir, { recursive: true })
  const manifestPath = path.join(extensionDir, 'manifest.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.host_permissions.push('http://127.0.0.1:*/*')
  manifest.host_permissions = [...new Set(manifest.host_permissions)]
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  return extensionDir
}

async function startTranslationSessionServer() {
  let nextRequestId = 0
  let retryRecoveryEnabled = false
  let releaseTabB = () => {}
  const tabBGate = new Promise<void>(resolve => {
    releaseTabB = resolve
  })
  const requests: RecordedProviderRequest[] = []

  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1')

    if (request.method === 'POST' && requestUrl.pathname.endsWith('/v1/chat/completions')) {
      const chunks: Uint8Array[] = []
      for await (const chunk of request) chunks.push(chunk)
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      const prompt = JSON.parse(body.messages?.[1]?.content ?? '{}')
      const texts = Array.isArray(prompt.texts) ? prompt.texts.map(String) : []
      const recorded: RecordedProviderRequest = {
        id: ++nextRequestId,
        path: requestUrl.pathname,
        texts,
        aborted: false,
        connectionClosedBeforeResponse: false,
        completed: false,
      }
      requests.push(recorded)
      request.once('aborted', () => {
        recorded.aborted = true
      })
      response.once('close', () => {
        if (!recorded.completed) recorded.connectionClosedBeforeResponse = true
      })

      if (requestUrl.pathname === '/cancel/v1/chat/completions') {
        const ordinal = requests.filter(item => item.path === requestUrl.pathname).length
        if (ordinal === 1) {
          await delay(30)
          respondWithTranslations(response, recorded, texts, 'EARLY_CANCEL:')
          return
        }
        await delay(6_000)
        respondWithTranslations(response, recorded, texts, 'LATE_CANCEL:')
        return
      }

      if (requestUrl.pathname === '/multi/v1/chat/completions') {
        const tabARequest = texts.some(text => text.includes('TAB_A'))
        if (tabARequest) {
          await delay(6_000)
        } else {
          await tabBGate
        }
        respondWithTranslations(
          response,
          recorded,
          texts,
          tabARequest ? 'TAB_A_LATE:' : 'TAB_B_OK:',
        )
        return
      }

      if (requestUrl.pathname === '/retry/v1/chat/completions') {
        const containsFailOnce = texts.some(text => text.includes('FAIL_ONCE'))
        if (containsFailOnce && !retryRecoveryEnabled) {
          recorded.completed = true
          response.writeHead(200, { 'Content-Type': 'application/json' })
          response.end(JSON.stringify({
            choices: [{ message: { content: 'invalid fixture output' } }],
          }))
          return
        }
        if (retryRecoveryEnabled) await delay(1_500)
        respondWithTranslations(response, recorded, texts, 'RETRY_OK:')
        return
      }

      response.writeHead(404).end()
      return
    }

    if (request.method === 'GET' && requestUrl.pathname === '/cancel.html') {
      respondWithHtml(response, makeCancelArticle())
      return
    }
    if (request.method === 'GET' && requestUrl.pathname === '/tab-a.html') {
      respondWithHtml(response, makeSmallArticle('TAB_A'))
      return
    }
    if (request.method === 'GET' && requestUrl.pathname === '/tab-b.html') {
      respondWithHtml(response, makeSmallArticle('TAB_B'))
      return
    }
    if (request.method === 'GET' && requestUrl.pathname === '/retry.html') {
      respondWithHtml(response, makeRetryArticle())
      return
    }

    response.writeHead(404).end()
  })

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Session fixture did not start.')
  const origin = `http://127.0.0.1:${address.port}`

  return {
    cancelArticleUrl: `${origin}/cancel.html`,
    tabAUrl: `${origin}/tab-a.html`,
    tabBUrl: `${origin}/tab-b.html`,
    retryArticleUrl: `${origin}/retry.html`,
    cancelProviderBaseUrl: `${origin}/cancel/v1`,
    multiTabProviderBaseUrl: `${origin}/multi/v1`,
    retryProviderBaseUrl: `${origin}/retry/v1`,
    requestsFor: (pathname: string) => requests.filter(request => request.path === pathname),
    allowRetryRecovery: () => {
      retryRecoveryEnabled = true
    },
    releaseTabB,
    close: () => new Promise<void>(resolve => {
      releaseTabB()
      server.closeAllConnections()
      server.close(() => resolve())
    }),
  }
}

function respondWithTranslations(
  response: ServerResponse,
  recorded: RecordedProviderRequest,
  texts: string[],
  prefix: string,
) {
  if (response.destroyed) return
  recorded.completed = true
  response.writeHead(200, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify({
    choices: [{
      message: {
        content: JSON.stringify(texts.map(text => `${prefix} ${text}`)),
      },
    }],
  }))
}

function respondWithHtml(response: ServerResponse, body: string) {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  response.end(body)
}

function makeCancelArticle(): string {
  const paragraphs = Array.from({ length: 45 }, (_, index) => `
    <p>CANCEL_ITEM_${String(index + 1).padStart(2, '0')} is a readable paragraph with enough source text to exercise queued translation work safely.</p>
  `).join('')
  return articleDocument('CANCEL_ITEM_HEADING for a long translation session', paragraphs)
}

function makeSmallArticle(marker: 'TAB_A' | 'TAB_B'): string {
  return articleDocument(
    `${marker} translation session`,
    `
      <p>${marker} first readable paragraph remains isolated from every other browser tab session.</p>
      <p>${marker} second readable paragraph confirms that translated results belong to this page only.</p>
    `,
  )
}

function makeRetryArticle(): string {
  return articleDocument(
    'Retry only the failed translation',
    `
      <p>This successful paragraph must remain rendered while another failed block is retried.</p>
      <p>FAIL_ONCE is the only readable paragraph that the controlled provider rejects initially.</p>
    `,
  )
}

function articleDocument(heading: string, body: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>${heading}</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 40px; max-width: 760px; }
      article { line-height: 1.6; }
    </style>
  </head>
  <body>
    <article>
      <h1>${heading}</h1>
      ${body}
    </article>
  </body>
</html>`
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
