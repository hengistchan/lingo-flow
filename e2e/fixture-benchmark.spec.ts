import { chromium, expect, test } from '@playwright/test'
import { createServer } from 'node:http'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const builtExtensionPath = path.resolve('apps/extension/output/chrome-mv3')

test('article fixture: translate, no duplicates on re-translate, clear restores DOM', async () => {
  const server = await startFixtureServer()
  const extension = await launchExtension({ allowLocalhost: true })

  try {
    await configureProvider(extension, server.successProviderBaseUrl)
    const page = await extension.context.newPage()
    await page.goto(server.url('article'))
    await injectContent(extension)

    const first = await translate(extension)
    expect(first).toMatchObject({ ok: true, data: { status: 'done' } })
    const translationCount = await page.locator('[data-lingoflow-translation]').count()
    expect(translationCount).toBe(first.data.totalBlocks)

    const second = await translate(extension)
    expect(second).toMatchObject({ ok: true, data: { status: 'done' } })
    await expect(page.locator('[data-lingoflow-translation]')).toHaveCount(translationCount)

    await clearTranslation(extension)
    await expect(page.locator('[data-lingoflow-translation]')).toHaveCount(0)
    await expect(page.locator('[data-lingoflow-block-id]')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Article Fixture' })).toBeVisible()
  } finally {
    await extension.close()
    await server.close()
  }
})

test('docs fixture: content roots and block collection', async () => {
  const server = await startFixtureServer()
  const extension = await launchExtension({ allowLocalhost: true })

  try {
    await configureProvider(extension, server.successProviderBaseUrl)
    const page = await extension.context.newPage()
    await page.goto(server.url('docs'))
    await injectContent(extension)

    const result = await translate(extension)
    expect(result).toMatchObject({ ok: true, data: { status: 'done' } })
    expect(result.data.totalBlocks).toBeGreaterThan(0)
    await expect(page.locator('[data-lingoflow-translation]').first()).toBeVisible()

    await clearTranslation(extension)
    await expect(page.locator('[data-lingoflow-translation]')).toHaveCount(0)
  } finally {
    await extension.close()
    await server.close()
  }
})

test('github-markdown fixture: markdown body translated, code blocks untouched', async () => {
  const server = await startFixtureServer()
  const extension = await launchExtension({ allowLocalhost: true })

  try {
    await configureProvider(extension, server.successProviderBaseUrl)
    const page = await extension.context.newPage()
    await page.goto(server.url('github-markdown'))
    await injectContent(extension)

    const result = await translate(extension)
    expect(result).toMatchObject({ ok: true, data: { status: 'done' } })
    expect(result.data.totalBlocks).toBeGreaterThan(0)

    await expect(page.locator('.markdown-body [data-lingoflow-translation]').first()).toBeVisible()
    expect(await page.locator('code [data-lingoflow-translation], pre [data-lingoflow-translation]').count()).toBe(0)

    await clearTranslation(extension)
    await expect(page.locator('[data-lingoflow-translation]')).toHaveCount(0)
  } finally {
    await extension.close()
    await server.close()
  }
})

test('wikipedia-like fixture: article content collected, infobox excluded', async () => {
  const server = await startFixtureServer()
  const extension = await launchExtension({ allowLocalhost: true })

  try {
    await configureProvider(extension, server.successProviderBaseUrl)
    const page = await extension.context.newPage()
    await page.goto(server.url('wikipedia-like'))
    await injectContent(extension)

    const result = await translate(extension)
    expect(result).toMatchObject({ ok: true, data: { status: 'done' } })
    expect(result.data.totalBlocks).toBeGreaterThan(0)

    await expect(page.locator('[data-lingoflow-translation]').first()).toBeVisible()
    await clearTranslation(extension)
    await expect(page.locator('[data-lingoflow-translation]')).toHaveCount(0)
  } finally {
    await extension.close()
    await server.close()
  }
})

test('nested-lists fixture: list items translated individually', async () => {
  const server = await startFixtureServer()
  const extension = await launchExtension({ allowLocalhost: true })

  try {
    await configureProvider(extension, server.successProviderBaseUrl)
    const page = await extension.context.newPage()
    await page.goto(server.url('nested-lists'))
    await injectContent(extension)

    const result = await translate(extension)
    expect(result).toMatchObject({ ok: true, data: { status: 'done' } })
    expect(result.data.totalBlocks).toBeGreaterThan(1)

    await expect(page.locator('li [data-lingoflow-translation]').first()).toBeVisible()
    await clearTranslation(extension)
    await expect(page.locator('[data-lingoflow-translation]')).toHaveCount(0)
  } finally {
    await extension.close()
    await server.close()
  }
})

test('tables fixture: table cells translated', async () => {
  const server = await startFixtureServer()
  const extension = await launchExtension({ allowLocalhost: true })

  try {
    await configureProvider(extension, server.successProviderBaseUrl)
    const page = await extension.context.newPage()
    await page.goto(server.url('tables'))
    await injectContent(extension)

    const result = await translate(extension)
    expect(result).toMatchObject({ ok: true, data: { status: 'done' } })
    expect(result.data.totalBlocks).toBeGreaterThan(0)

    await expect(page.locator('[data-lingoflow-translation]').first()).toBeVisible()
    await clearTranslation(extension)
    await expect(page.locator('[data-lingoflow-translation]')).toHaveCount(0)
  } finally {
    await extension.close()
    await server.close()
  }
})

test('code-heavy fixture: code blocks stay untranslated', async () => {
  const server = await startFixtureServer()
  const extension = await launchExtension({ allowLocalhost: true })

  try {
    await configureProvider(extension, server.successProviderBaseUrl)
    const page = await extension.context.newPage()
    await page.goto(server.url('code-heavy'))
    await injectContent(extension)

    const result = await translate(extension)
    expect(result).toMatchObject({ ok: true, data: { status: 'done' } })
    expect(result.data.totalBlocks).toBeGreaterThan(0)

    expect(await page.locator('code [data-lingoflow-translation], pre [data-lingoflow-translation]').count()).toBe(0)
    await expect(page.locator('[data-lingoflow-translation]').first()).toBeVisible()

    await clearTranslation(extension)
    await expect(page.locator('[data-lingoflow-translation]')).toHaveCount(0)
  } finally {
    await extension.close()
    await server.close()
  }
})

test('shadow-dom fixture: open shadow DOM content translated', async () => {
  const server = await startFixtureServer()
  const extension = await launchExtension({ allowLocalhost: true })

  try {
    await configureProvider(extension, server.successProviderBaseUrl)
    const page = await extension.context.newPage()
    await page.goto(server.url('shadow-dom'))
    await injectContent(extension)

    const result = await translate(extension)
    expect(result).toMatchObject({ ok: true })
    expect(result.data.totalBlocks).toBeGreaterThan(0)

    await clearTranslation(extension)
  } finally {
    await extension.close()
    await server.close()
  }
})

test('spa-route fixture: route change clears stale work', async () => {
  const server = await startFixtureServer()
  const extension = await launchExtension({ allowLocalhost: true })

  try {
    await configureProvider(extension, server.successProviderBaseUrl)
    const page = await extension.context.newPage()
    await page.goto(server.url('spa-route'))
    await injectContent(extension)

    const first = await translate(extension)
    expect(first).toMatchObject({ ok: true, data: { status: 'done' } })
    await expect(page.locator('[data-lingoflow-translation]').first()).toBeVisible()

    await page.evaluate(() => {
      window.history.pushState({}, '', '/page-2')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    await page.waitForTimeout(600)

    const result = await extension.worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) throw new Error('No active tab found.')
      return chrome.tabs.sendMessage(tab.id, { type: 'page/getDiagnostics' })
    })
    if (result?.ok) {
      expect(result.data.rootGeneration).toBeGreaterThanOrEqual(2)
    }

    await clearTranslation(extension)
  } finally {
    await extension.close()
    await server.close()
  }
})

test('infinite-scroll fixture: dynamic content translated once', async () => {
  const server = await startFixtureServer()
  const extension = await launchExtension({ allowLocalhost: true })

  try {
    await configureProvider(extension, server.successProviderBaseUrl)
    const page = await extension.context.newPage()
    await page.goto(server.url('infinite-scroll'))
    await injectContent(extension)

    const first = await translate(extension)
    expect(first).toMatchObject({ ok: true, data: { status: 'done' } })
    const initialCount = first.data.totalBlocks

    await extension.worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) throw new Error('No active tab found.')
      await chrome.tabs.sendMessage(tab.id, { type: 'page/enableDynamicTranslation' })
    })

    await page.evaluate(() => {
      const container = document.querySelector('.scroll-container')
      if (container) {
        const newItem = document.createElement('p')
        newItem.textContent = 'This is a dynamically loaded paragraph that should be translated exactly once when dynamic mode is enabled.'
        container.appendChild(newItem)
      }
    })

    await page.waitForTimeout(1200)

    const translationCount = await page.locator('[data-lingoflow-translation]').count()
    expect(translationCount).toBeGreaterThanOrEqual(initialCount)
    expect(translationCount).toBeLessThanOrEqual(initialCount + 1)

    await clearTranslation(extension)
  } finally {
    await extension.close()
    await server.close()
  }
})

test('popup translate enables dynamic translation for newly loaded content', async () => {
  const server = await startFixtureServer()
  const extension = await launchExtension({ allowLocalhost: true })

  try {
    await configureProvider(extension, server.successProviderBaseUrl)
    const page = await extension.context.newPage()
    await page.goto(server.url('infinite-scroll'))

    const popup = await extension.context.newPage()
    await popup.goto(extension.url('popup.html'))
    await page.bringToFront()

    await popup.getByRole('button', { name: 'Translate to Simplified Chinese' }).click()
    await expect(popup.locator('.status')).toHaveText('Translation complete', { timeout: 8_000 })
    const initialCount = await page.locator('[data-lingoflow-translation]').count()

    await page.evaluate(() => {
      const container = document.querySelector('.scroll-container')
      if (!container) return
      const newItem = document.createElement('p')
      newItem.textContent = 'This newly loaded paragraph should translate after the popup action enables progressive translation.'
      container.appendChild(newItem)
    })

    await expect(page.locator('[data-lingoflow-translation]')).toHaveCount(initialCount + 1, { timeout: 8_000 })
    await expect(popup.locator('.result-summary')).toContainText(`${initialCount + 1}/${initialCount + 1}`, { timeout: 8_000 })

    await clearTranslation(extension)
  } finally {
    await extension.close()
    await server.close()
  }
})

test('partially-interactive fixture: buttons and forms not translated', async () => {
  const server = await startFixtureServer()
  const extension = await launchExtension({ allowLocalhost: true })

  try {
    await configureProvider(extension, server.successProviderBaseUrl)
    const page = await extension.context.newPage()
    await page.goto(server.url('partially-interactive'))
    await injectContent(extension)

    const result = await translate(extension)
    expect(result).toMatchObject({ ok: true, data: { status: 'done' } })
    expect(result.data.totalBlocks).toBeGreaterThan(0)

    expect(await page.locator('button [data-lingoflow-translation]').count()).toBe(0)
    expect(await page.locator('input [data-lingoflow-translation]').count()).toBe(0)
    expect(await page.locator('form [data-lingoflow-translation]').count()).toBe(0)

    await clearTranslation(extension)
    await expect(page.locator('[data-lingoflow-translation]')).toHaveCount(0)
  } finally {
    await extension.close()
    await server.close()
  }
})

test('diagnostics reports matched rule and counts', async () => {
  const server = await startFixtureServer()
  const extension = await launchExtension({ allowLocalhost: true })

  try {
    await configureProvider(extension, server.successProviderBaseUrl)
    const page = await extension.context.newPage()
    await page.goto(server.url('article'))
    await injectContent(extension)
    await translate(extension)

    const result = await extension.worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) throw new Error('No active tab found.')
      return chrome.tabs.sendMessage(tab.id, { type: 'page/getDiagnostics' })
    })

    expect(result).toMatchObject({ ok: true })
    expect(result.data.rule).toBeDefined()
    expect(result.data.rule.id).toBeTruthy()
    expect(result.data.rule.matchedRuleIds).toBeInstanceOf(Array)
    expect(result.data.counts).toBeDefined()
    expect(result.data.counts.collected).toBeGreaterThan(0)
    expect(result.data.counts.rendered).toBeGreaterThan(0)

    await clearTranslation(extension)
  } finally {
    await extension.close()
    await server.close()
  }
})

// ─── Helpers ───

async function configureProvider(extension: Awaited<typeof launchExtension>, providerBaseUrl: string) {
  const options = await extension.context.newPage()
  await options.goto(extension.url('options.html'))
  await options.evaluate(async (baseUrl) => {
    const current = await chrome.runtime.sendMessage({ type: 'settings/get' })
    if (!current?.ok) return
    await chrome.runtime.sendMessage({
      type: 'settings/save',
      payload: {
        settings: {
          ...current.data,
          cacheEnabled: false,
          defaultProviderId: 'openai-compatible',
          fallbackProviderId: '',
          providers: {
            ...current.data.providers,
            'openai-compatible': {
              ...current.data.providers['openai-compatible'],
              values: { baseUrl, apiKey: 'test-only-key', model: 'test-model' },
            },
          },
        },
      },
    })
  }, providerBaseUrl)
  await options.close()
}

async function injectContent(extension: Awaited<typeof launchExtension>) {
  await extension.worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) throw new Error('No active tab found.')
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['lingoflow-content.js'],
    })
  })
}

async function translate(extension: Awaited<typeof launchExtension>) {
  return extension.worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) throw new Error('No active tab found.')
    return chrome.tabs.sendMessage(tab.id, {
      type: 'page/translate',
      payload: { targetLang: 'ja' },
    })
  })
}

async function clearTranslation(extension: Awaited<typeof launchExtension>) {
  await extension.worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) throw new Error('No active tab found.')
    await chrome.tabs.sendMessage(tab.id, { type: 'page/clear' })
  })
}

type ExtensionOptions = {
  allowLocalhost?: boolean
}

async function launchExtension(options: ExtensionOptions = {}) {
  const extensionDir = options.allowLocalhost
    ? prepareTestExtensionDir(options)
    : builtExtensionPath

  const userDataDir = mkdtempSync(path.join(os.tmpdir(), 'lingoflow-fixture-e2e-'))
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
      rmSync(userDataDir, { recursive: true, force: true })
      if (extensionDir !== builtExtensionPath) {
        rmSync(extensionDir, { recursive: true, force: true })
      }
    },
  }
}

function prepareTestExtensionDir(options: ExtensionOptions): string {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'lingoflow-ext-fixture-'))
  cpSync(builtExtensionPath, tmpDir, { recursive: true })
  const manifestPath = path.join(tmpDir, 'manifest.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
  if (options.allowLocalhost) manifest.host_permissions.push('http://127.0.0.1:*/*')
  manifest.host_permissions = [...new Set(manifest.host_permissions)]
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  return tmpDir
}

// ─── Fixture HTML ───

const FIXTURES: Record<string, string> = {
  article: `<!doctype html>
<html lang="en"><head><title>Article Fixture</title></head>
<body>
  <article>
    <h1>Article Fixture</h1>
    <p>This article paragraph is long enough to be collected and translated by the extension runtime.</p>
    <p>A second paragraph ensures that multiple blocks are collected during a single translation run.</p>
  </article>
</body></html>`,

  docs: `<!doctype html>
<html lang="en"><head><title>Docs Fixture</title></head>
<body>
  <nav><a href="/">Home</a> <a href="/guide">Guide</a></nav>
  <main>
    <h1>Documentation Page</h1>
    <p>This documentation paragraph explains a concept clearly enough to be translated.</p>
    <h2>Getting Started</h2>
    <p>Follow these steps to begin using the library in your own project environment.</p>
  </main>
  <aside class="sidebar"><a href="/other">Other page</a></aside>
</body></html>`,

  'github-markdown': `<!doctype html>
<html lang="en"><head><title>GitHub Markdown Fixture</title></head>
<body>
  <main>
    <div class="feed-card"><h3><a href="/repo/pull/1">Pull request title</a></h3></div>
    <div class="markdown-body">
      <h2>What this does</h2>
      <p>This pull request improves the overall documentation quality and readability.</p>
      <blockquote><p>This quoted paragraph should also be translated as part of the markdown body.</p></blockquote>
      <pre><code>const shouldNotTranslate = true</code></pre>
      <ul>
        <li>Use the workspace command from the repository root when running tests.</li>
      </ul>
    </div>
  </main>
</body></html>`,

  'wikipedia-like': `<!doctype html>
<html lang="en"><head><title>Wikipedia-like Fixture</title></head>
<body>
  <div class="mw-parser-output">
    <h1>Translation</h1>
    <p>Translation is the communication of the meaning of a source-language text by means of an equivalent target-language text.</p>
    <table class="infobox"><tr><td>Related field</td><td>Linguistics</td></tr></table>
    <h2>History</h2>
    <p>The history of translation spans thousands of years and encompasses many cultures and civilizations.</p>
  </div>
</body></html>`,

  'nested-lists': `<!doctype html>
<html lang="en"><head><title>Nested Lists Fixture</title></head>
<body>
  <article>
    <h1>Nested Lists</h1>
    <ul>
      <li>First top-level item is long enough to translate.</li>
      <li>Second top-level item with enough content to be meaningful.
        <ul>
          <li>First nested item with sufficient length for translation.</li>
          <li>Second nested item also has enough text content.</li>
        </ul>
      </li>
      <li>Third top-level item provides additional translatable content.</li>
    </ul>
  </article>
</body></html>`,

  tables: `<!doctype html>
<html lang="en"><head><title>Tables Fixture</title></head>
<body>
  <article>
    <h1>Table Data</h1>
    <table>
      <thead><tr><th>Column A</th><th>Column B</th></tr></thead>
      <tbody>
        <tr><td>This cell has enough text to be translated by the runtime.</td><td>Another cell with sufficient content for translation.</td></tr>
        <tr><td>Third row first cell with translatable paragraph text.</td><td>Third row second cell also has enough content.</td></tr>
      </tbody>
    </table>
  </article>
</body></html>`,

  'code-heavy': `<!doctype html>
<html lang="en"><head><title>Code-heavy Fixture</title></head>
<body>
  <article>
    <h1>Code Examples</h1>
    <p>This introductory paragraph explains the code examples shown below in the article.</p>
    <pre><code>function hello() {
  console.log('world')
  return true
}</code></pre>
    <p>Another paragraph between code blocks provides more translatable content for the test.</p>
    <pre><code>const x = 42
const y = x * 2</code></pre>
    <p>The final paragraph wraps up the code examples with a concluding explanation.</p>
  </article>
</body></html>`,

  'shadow-dom': `<!doctype html>
<html lang="en"><head><title>Shadow DOM Fixture</title></head>
<body>
  <article>
    <h1>Shadow DOM Test</h1>
    <p>This paragraph is in the light DOM and should be translated by the runtime.</p>
    <div id="shadow-host"></div>
  </article>
  <script>
    const host = document.getElementById('shadow-host')
    const shadow = host.attachShadow({ mode: 'open' })
    shadow.innerHTML = '<p>This paragraph lives inside an open shadow root and may be discovered.</p>'
  </script>
</body></html>`,

  'spa-route': `<!doctype html>
<html lang="en"><head><title>SPA Route Fixture</title></head>
<body>
  <article>
    <h1>SPA Page One</h1>
    <p>This is the first page content that should be translated when the route is active.</p>
  </article>
</body></html>`,

  'infinite-scroll': `<!doctype html>
<html lang="en"><head><title>Infinite Scroll Fixture</title></head>
<body>
  <div class="scroll-container">
    <p>Initial paragraph one with enough text to be collected as a translatable block.</p>
    <p>Initial paragraph two provides additional translatable content for the test run.</p>
  </div>
</body></html>`,

  'partially-interactive': `<!doctype html>
<html lang="en"><head><title>Partially Interactive Fixture</title></head>
<body>
  <article>
    <h1>Interactive Page</h1>
    <p>This article paragraph should be translated because it is readable content.</p>
    <form>
      <label>Name <input type="text" /></label>
      <button type="button">Click me</button>
    </form>
    <p>Another paragraph after the form also deserves translation from the runtime.</p>
  </article>
</body></html>`,
}

function startFixtureServer() {
  let providerRequestCount = 0

  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1')

    if (request.method === 'POST' && requestUrl.pathname.endsWith('/v1/chat/completions')) {
      providerRequestCount++
      const chunks: Uint8Array[] = []
      for await (const chunk of request) chunks.push(chunk)
      const requestBody = JSON.parse(Buffer.concat(chunks).toString('utf-8'))
      const prompt = JSON.parse(requestBody.messages?.[1]?.content ?? '{}')
      const texts: string[] = Array.isArray(prompt.texts) ? prompt.texts.map(String) : []

      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(texts.map((t: string) => `訳: ${t}`)) } }],
      }))
      return
    }

    const fixtureName = requestUrl.pathname.replace(/^\//, '').replace(/\.html$/, '')
    const html = FIXTURES[fixtureName]
    if (html) {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      response.end(html)
      return
    }

    response.writeHead(404)
    response.end('Not found')
  })

  return new Promise<{
    url: (name: string) => string
    successProviderBaseUrl: string
    providerRequestCount: () => number
    close: () => Promise<void>
  }>(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('Server did not start.')
      const origin = `http://127.0.0.1:${address.port}`
      resolve({
        url: (name: string) => `${origin}/${name}`,
        successProviderBaseUrl: `${origin}/success/v1`,
        providerRequestCount: () => providerRequestCount,
        close: () => new Promise<void>(r => server.close(() => r())),
      })
    })
  })
}
