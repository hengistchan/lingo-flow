import { chromium, expect, test, type Page } from '@playwright/test'
import { createServer } from 'node:http'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

const builtExtensionPath = path.resolve('apps/extension/output/chrome-mv3')
const undefinedError = /Cannot read properties of undefined/

test('installed extension renders popup and options with real extension APIs', async () => {
  const extension = await launchExtension()

  try {
    const popup = await extension.context.newPage()
    const popupErrors = collectRuntimeErrors(popup)

    await popup.goto(extension.url('popup.html'))

    await expect(popup).toHaveTitle('LingoFlow')
    await expect(popup.getByRole('heading', { name: 'LingoFlow' })).toBeVisible()
    await expect(popup.getByText('Translation service is not configured')).toBeVisible()
    await expect(popup.getByLabel('Target language')).toHaveValue('zh-Hans')
    await expect(popup.getByRole('button', { name: 'Configure translation service' })).toBeVisible()
    await expect(popup.getByText('Ready')).toHaveCount(0)
    await expect(popup.getByText(undefinedError)).toHaveCount(0)
    expect(popupErrors()).toEqual([])

    const options = await extension.context.newPage()
    const optionsErrors = collectRuntimeErrors(options)

    await options.goto(extension.url('options.html'))
    await expect(options).toHaveTitle('LingoFlow Settings')
    await expect(options.getByRole('heading', { name: 'General Settings' })).toBeVisible()

    await options.getByLabel('Target language').fill('zh-Hant')
    await options.getByRole('button', { name: 'Save Settings' }).click()

    await expect(options.getByText('Settings saved.')).toBeVisible()
    await expect(options.getByText(undefinedError)).toHaveCount(0)
    expect(optionsErrors()).toEqual([])
  } finally {
    await extension.close()
  }
})

test('installed extension injects content runtime into a real page', async () => {
  const articleServer = await startArticleServer()
  const extension = await launchExtension({ allowLocalhost: true })

  try {
    const article = await extension.context.newPage()
    const articleErrors = collectRuntimeErrors(article)

    await article.goto(articleServer.url)
    await expect(article.getByRole('heading', { name: 'A field guide to quiet reading' })).toBeVisible()

    // Step 1: Inject content runtime into the article page.
    await extension.worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) throw new Error('No active article tab found.')
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['lingoflow-content.js'],
      })
    })

    // Step 2: Send translate request and verify blocks are found.
    // Without API credentials, individual blocks fail but the overall status is 'done'.
    const result = await extension.worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) throw new Error('No active article tab found.')
      return chrome.tabs.sendMessage(tab.id, { type: 'page/translate' })
    })

    expect(result).toMatchObject({ ok: true })
    expect(result.data.totalBlocks).toBeGreaterThan(0)
    expect(result.data.failedBlocks).toBeGreaterThan(0)

    await expect.poll(() => article.locator('[data-lingoflow-block-id]').count()).toBeGreaterThan(0)
    await expect(article.getByText(undefinedError)).toHaveCount(0)
    expect(articleErrors()).toEqual([])
  } finally {
    await extension.close()
    await articleServer.close()
  }
})

test('production build manifest does not contain test-only host permissions', () => {
  const manifest = JSON.parse(readFileSync(path.join(builtExtensionPath, 'manifest.json'), 'utf-8'))

  expect(manifest.host_permissions).not.toContain(expect.stringMatching(/127\.0\.0\.1/))
  expect(manifest.host_permissions).not.toContain(expect.stringMatching(/<all_urls>/))
  expect(manifest.permissions).not.toContain(expect.stringMatching(/<all_urls>/))
})

test('production content script contains no Unicode noncharacters', () => {
  const contentScript = readFileSync(path.join(builtExtensionPath, 'lingoflow-content.js'), 'utf-8')

  expect(contentScript).not.toContain('\uFFFF')
})

type ExtensionOptions = {
  allowLocalhost?: boolean
}

async function launchExtension(options: ExtensionOptions = {}) {
  const extensionDir = options.allowLocalhost
    ? prepareTestExtensionDir()
    : builtExtensionPath

  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'lingoflow-extension-e2e-'))
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: process.env.PLAYWRIGHT_EXTENSION_CHANNEL ?? 'chromium',
    headless: true,
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
    ],
  })

  let [worker] = context.serviceWorkers()
  if (!worker) {
    worker = await context.waitForEvent('serviceworker')
  }

  const extensionId = new URL(worker.url()).host

  return {
    context,
    worker,
    extensionId,
    url: (file: string) => `chrome-extension://${extensionId}/${file}`,
    close: async () => {
      await context.close()
      await rm(userDataDir, { recursive: true, force: true })
      if (options.allowLocalhost) {
        rmSync(extensionDir, { recursive: true, force: true })
      }
    },
  }
}

// Creates a temporary extension directory with the production build files
// and a patched manifest that adds a localhost host permission for content-script injection E2E.
// The production manifest is never modified.
function prepareTestExtensionDir(): string {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'lingoflow-ext-test-'))

  cpSync(builtExtensionPath, tmpDir, { recursive: true })

  // Patch manifest: add localhost host permission for content-script injection E2E.
  const manifestPath = path.join(tmpDir, 'manifest.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
  manifest.host_permissions.push('http://127.0.0.1:*/*')
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))

  return tmpDir
}

function startArticleServer() {
  const server = createServer((_, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    response.end(`<!doctype html>
<html lang="en">
  <head>
    <title>LingoFlow Article Fixture</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 40px; max-width: 720px; }
      article { line-height: 1.6; }
    </style>
  </head>
  <body>
    <article>
      <h1>A field guide to quiet reading</h1>
      <p>Reading a difficult page becomes easier when translation stays close to the original paragraph and does not interrupt the structure of the article.</p>
      <p>The extension should identify meaningful text blocks, keep the page stable, and avoid touching controls or navigation elements.</p>
    </article>
  </body>
</html>`)
  })

  return new Promise<{ url: string; close: () => Promise<void> }>(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('Article server did not start.')

      resolve({
        url: `http://127.0.0.1:${address.port}/article.html`,
        close: () => new Promise<void>(r => server.close(() => r())),
      })
    })
  })
}

function collectRuntimeErrors(page: Page) {
  const errors: string[] = []

  page.on('pageerror', error => {
    errors.push(error.message)
  })

  page.on('console', message => {
    if (message.type() === 'error' && undefinedError.test(message.text())) {
      errors.push(message.text())
    }
  })

  return () => errors
}
