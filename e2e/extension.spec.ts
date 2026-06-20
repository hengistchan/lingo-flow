import { chromium, expect, test, type Page } from '@playwright/test'
import { createServer } from 'node:http'
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

const builtExtensionPath = path.resolve('apps/extension/output/chrome-mv3')
const undefinedError = /Cannot read properties of undefined/
const LINGOFLOW_DEV_INSPECT_MARKER = 'lingoflow/dev-inspect'

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
    await expect(options.getByRole('heading', { name: 'Languages' })).toBeVisible()

    await options.getByLabel('Target language').selectOption('zh-Hant')
    await expect(options.getByRole('button', { name: 'Save settings' })).toBeEnabled()
    await options.getByRole('button', { name: 'Save settings' }).click()

    await expect(options.getByText('Settings saved')).toBeVisible()
    await options.getByLabel('Target language').selectOption('ja')
    await expect(options.getByText('Settings saved')).toHaveCount(0)
    await expect(options.getByRole('button', { name: 'Save settings' })).toBeEnabled()

    await options.getByRole('button', { name: 'Translation service' }).click()
    await expect(options.getByText('Testing sends one short sample to the selected provider.')).toBeVisible()
    await expect(options.getByText('Complete the selected provider configuration before testing.')).toHaveCount(0)
    await options.getByRole('button', { name: 'Test connection' }).click()
    await expect(options.getByText('Complete the selected provider configuration before testing.')).toBeVisible()

    await expect(options.getByText(undefinedError)).toHaveCount(0)
    expect(optionsErrors()).toEqual([])
  } finally {
    await extension.close()
  }
})

test('installed extension saves Google Translate Free without asking for provider host permission', async () => {
  const extension = await launchExtension()

  try {
    const options = await extension.context.newPage()
    const optionsErrors = collectRuntimeErrors(options)

    await options.goto(extension.url('options.html'))
    await options.getByRole('button', { name: 'Translation service' }).click()
    await options.getByLabel('Default provider').selectOption('google-free-translate')
    await expect(options.getByRole('button', { name: 'Save settings' })).toBeEnabled()

    await options.getByRole('button', { name: 'Save settings' }).click()

    await expect(options.getByText('Settings saved')).toBeVisible()
    await expect(options.getByText('Allow access to this provider address to continue.')).toHaveCount(0)
    const savedSummary = await options.evaluate(() =>
      chrome.runtime.sendMessage({ type: 'settings/getSummary' }),
    )
    expect(savedSummary).toMatchObject({
      ok: true,
      data: {
        providerId: 'google-free-translate',
        providerConfigured: true,
      },
    })
    await expect.poll(() =>
      options.evaluate(origin => chrome.permissions.contains({ origins: [origin] }), 'https://translate.googleapis.com/*'),
    ).toBe(true)
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

    // Step 2: A current-page override reaches every task without changing the saved default.
    const result = await extension.worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) throw new Error('No active article tab found.')
      return chrome.tabs.sendMessage(tab.id, {
        type: 'page/translate',
        payload: { targetLang: 'ja' },
      })
    })

    expect(result).toMatchObject({
      ok: true,
      data: {
        status: 'failed',
        targetLang: 'ja',
        translatedBlocks: 0,
      },
    })
    expect(result.data.totalBlocks).toBeGreaterThan(0)
    expect(result.data.failedBlocks).toBeGreaterThan(0)

    const extensionPage = await extension.context.newPage()
    await extensionPage.goto(extension.url('options.html'))
    const summary = await extensionPage.evaluate(() =>
      chrome.runtime.sendMessage({ type: 'settings/getSummary' }),
    )
    expect(summary).toMatchObject({
      ok: true,
      data: {
        targetLang: 'zh-Hans',
        providerConfigured: false,
      },
    })
    expect(summary.data).not.toHaveProperty('providers')

    await expect.poll(() => article.locator('[data-lingoflow-block-id]').count()).toBeGreaterThan(0)
    await expect(article.getByText(undefinedError)).toHaveCount(0)
    expect(articleErrors()).toEqual([])
  } finally {
    await extension.close()
    await articleServer.close()
  }
})

test('installed popup keeps the translating target accurate and locks it until completion', async () => {
  const articleServer = await startArticleServer()
  const extension = await launchExtension({ allowLocalhost: true })

  try {
    const extensionPage = await extension.context.newPage()
    await extensionPage.goto(extension.url('options.html'))
    const saveResponse = await extensionPage.evaluate(async providerBaseUrl => {
      const current = await chrome.runtime.sendMessage({ type: 'settings/get' })
      if (!current?.ok) return current

      return chrome.runtime.sendMessage({
        type: 'settings/save',
        payload: {
          settings: {
            ...current.data,
            cacheEnabled: false,
            defaultProviderId: 'openai-compatible',
            providers: {
              ...current.data.providers,
              'openai-compatible': {
                ...current.data.providers['openai-compatible'],
                values: { baseUrl: providerBaseUrl, apiKey: 'test-only-key', model: 'test-model' },
              },
            },
          },
        },
      })
    }, articleServer.slowProviderBaseUrl)
    expect(saveResponse).toMatchObject({ ok: true })

    const article = await extension.context.newPage()
    await article.goto(articleServer.url)
    await extension.worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) throw new Error('No active article tab found.')
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['lingoflow-content.js'],
      })
      void chrome.tabs.sendMessage(tab.id, {
        type: 'page/translate',
        payload: { targetLang: 'ja' },
      })
    })

    const popup = await extension.context.newPage()
    await popup.goto(extension.url('popup.html'))
    await article.bringToFront()

    await expect(popup.locator('.brand-copy p')).toHaveText('Translating')
    await expect(popup.getByLabel('Target language')).toHaveValue('ja')
    await expect(popup.getByLabel('Target language')).toBeDisabled()
    await expect(popup.getByRole('button', { name: 'Translating to Japanese' })).toBeDisabled()

    await expect(popup.locator('.brand-copy p')).toHaveText('Translation complete', { timeout: 8_000 })
    await expect(popup.getByLabel('Target language')).toBeEnabled()
    await expect(popup.getByLabel('Target language')).toHaveValue('ja')
    await expect(popup.getByRole('button', { name: 'Translate again in Japanese' })).toBeVisible()
  } finally {
    await extension.close()
    await articleServer.close()
  }
})

test('installed extension reports mixed provider results as partial without saving the page override', async () => {
  const articleServer = await startArticleServer()
  const extension = await launchExtension({ allowLocalhost: true })

  try {
    const extensionPage = await extension.context.newPage()
    await extensionPage.goto(extension.url('options.html'))
    const saveResponse = await extensionPage.evaluate(async providerBaseUrl => {
      const current = await chrome.runtime.sendMessage({ type: 'settings/get' })
      if (!current?.ok) return current

      return chrome.runtime.sendMessage({
        type: 'settings/save',
        payload: {
          settings: {
            ...current.data,
            cacheEnabled: false,
            defaultProviderId: 'openai-compatible',
            providers: {
              ...current.data.providers,
              'openai-compatible': {
                ...current.data.providers['openai-compatible'],
                values: { baseUrl: providerBaseUrl, apiKey: 'test-only-key', model: 'test-model' },
              },
            },
          },
        },
      })
    }, articleServer.providerBaseUrl)
    expect(saveResponse).toMatchObject({ ok: true })

    const article = await extension.context.newPage()
    await article.goto(articleServer.url)

    await extension.worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) throw new Error('No active article tab found.')
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['lingoflow-content.js'],
      })
    })

    const result = await extension.worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) throw new Error('No active article tab found.')
      return chrome.tabs.sendMessage(tab.id, {
        type: 'page/translate',
        payload: { targetLang: 'ja' },
      })
    })

    expect(result).toMatchObject({
      ok: true,
      data: {
        status: 'partial',
        targetLang: 'ja',
      },
    })
    expect(result.data.translatedBlocks).toBeGreaterThan(0)
    expect(result.data.failedBlocks).toBeGreaterThan(0)

    const summary = await extensionPage.evaluate(() =>
      chrome.runtime.sendMessage({ type: 'settings/getSummary' }),
    )
    expect(summary).toMatchObject({
      ok: true,
      data: {
        targetLang: 'zh-Hans',
        providerConfigured: true,
      },
    })

    const popup = await extension.context.newPage()
    await popup.goto(extension.url('popup.html'))
    await article.bringToFront()

    await expect(popup.locator('.brand-copy p')).toHaveText('Some content could not be translated')
    await expect(popup.getByLabel('Target language')).toHaveValue('ja')
    await expect(popup.getByRole('button', { name: 'Translate again in Japanese' })).toBeVisible()

    await popup.getByLabel('Target language').selectOption('fr')
    await popup.waitForTimeout(1_100)
    await expect(popup.getByLabel('Target language')).toHaveValue('fr')
    await expect(popup.getByRole('button', { name: 'Translate again in French' })).toBeVisible()
  } finally {
    await extension.close()
    await articleServer.close()
  }
})

test('installed extension connects to an explicitly authorized custom OpenAI-compatible origin', async () => {
  const articleServer = await startArticleServer()
  const extension = await launchExtension({ allowLocalhost: true })

  try {
    const options = await extension.context.newPage()
    await options.goto(extension.url('options.html'))

    await options.getByRole('button', { name: 'Translation service' }).click()
    await options.getByLabel('Default provider').selectOption('openai-compatible')
    await options.getByLabel('API Key').fill('test-only-key')
    await options.getByLabel('Base URL').fill(articleServer.providerBaseUrl)
    await options.getByLabel('Model').fill('test-model')

    await options.getByRole('button', { name: 'Translation service' }).click()
    await options.getByRole('button', { name: 'Test connection' }).click()

    await expect(options.getByText('Connection successful')).toBeVisible()
    await options.getByRole('button', { name: 'Save settings' }).click()
    await expect(options.getByText('Settings saved')).toBeVisible()
    const savedSummary = await options.evaluate(() =>
      chrome.runtime.sendMessage({ type: 'settings/getSummary' }),
    )
    expect(savedSummary).toMatchObject({
      ok: true,
      data: {
        providerId: 'openai-compatible',
        providerConfigured: true,
      },
    })
    const providerOrigin = `${new URL(articleServer.providerBaseUrl).origin}/*`
    await expect.poll(() =>
      options.evaluate(origin => chrome.permissions.contains({ origins: [origin] }), providerOrigin),
    ).toBe(true)
  } finally {
    await extension.close()
    await articleServer.close()
  }
})

test('installed extension connects to Azure protocol and uses it as a fallback provider', async () => {
  const articleServer = await startArticleServer()
  const extension = await launchExtension({ allowLocalhost: true })

  try {
    const options = await extension.context.newPage()
    await options.goto(extension.url('options.html'))
    await options.getByRole('button', { name: 'Translation service' }).click()
    await options.getByLabel('Region').fill('test-region')
    await options.getByLabel('API Key').fill('azure-test-key')
    await options.getByLabel('Endpoint').fill(articleServer.azureProviderEndpoint)
    await options.getByRole('button', { name: 'Translation service' }).click()
    await options.getByRole('button', { name: 'Test connection' }).click()
    await expect(options.getByText('Connection successful')).toBeVisible()
    await options.getByRole('button', { name: 'Save settings' }).click()
    await expect(options.getByText('Settings saved')).toBeVisible()
    const savedSummary = await options.evaluate(() =>
      chrome.runtime.sendMessage({ type: 'settings/getSummary' }),
    )
    expect(savedSummary).toMatchObject({
      ok: true,
      data: {
        providerId: 'azure-translator',
        providerConfigured: true,
      },
    })

    const saveResponse = await options.evaluate(async providerUrls => {
      const current = await chrome.runtime.sendMessage({ type: 'settings/get' })
      if (!current?.ok) return current

      return chrome.runtime.sendMessage({
        type: 'settings/save',
        payload: {
          settings: {
            ...current.data,
            cacheEnabled: false,
            defaultProviderId: 'openai-compatible',
            fallbackProviderId: 'azure-translator',
            providers: {
              'azure-translator': {
                id: 'azure-translator',
                presetId: 'azure-translator',
                name: 'Azure Translator',
                values: { endpoint: providerUrls.azure, key: 'azure-test-key', region: 'test-region' },
              },
              'openai-compatible': {
                id: 'openai-compatible',
                presetId: 'openai-compatible',
                name: 'OpenAI-compatible',
                values: { baseUrl: providerUrls.openai, apiKey: 'openai-test-key', model: 'test-model' },
              },
            },
          },
        },
      })
    }, {
      azure: articleServer.azureProviderEndpoint,
      openai: articleServer.providerBaseUrl,
    })
    expect(saveResponse).toMatchObject({ ok: true })

    const article = await extension.context.newPage()
    await article.goto(articleServer.url)
    await extension.worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) throw new Error('No active article tab found.')
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['lingoflow-content.js'],
      })
    })

    const result = await extension.worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) throw new Error('No active article tab found.')
      return chrome.tabs.sendMessage(tab.id, {
        type: 'page/translate',
        payload: { targetLang: 'ja' },
      })
    })

    expect(result).toMatchObject({ ok: true, data: { status: 'done', failedBlocks: 0 } })
    await expect(article.locator('[data-lingoflow-translation]').first()).toContainText('AZ:')
  } finally {
    await extension.close()
    await articleServer.close()
  }
})

test('installed extension keeps the page intact when a provider returns invalid output', async () => {
  const articleServer = await startArticleServer()
  const extension = await launchExtension({ allowLocalhost: true })

  try {
    const extensionPage = await extension.context.newPage()
    await extensionPage.goto(extension.url('options.html'))
    const saveResponse = await extensionPage.evaluate(async providerBaseUrl => {
      const current = await chrome.runtime.sendMessage({ type: 'settings/get' })
      if (!current?.ok) return current

      return chrome.runtime.sendMessage({
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
                values: { baseUrl: providerBaseUrl, apiKey: 'test-only-key', model: 'test-model' },
              },
            },
          },
        },
      })
    }, articleServer.invalidProviderBaseUrl)
    expect(saveResponse).toMatchObject({ ok: true })

    const article = await extension.context.newPage()
    const articleErrors = collectRuntimeErrors(article)
    await article.goto(articleServer.url)
    const originalHeading = await article.getByRole('heading', { name: 'A field guide to quiet reading' }).textContent()

    await extension.worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) throw new Error('No active article tab found.')
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['lingoflow-content.js'],
      })
    })

    const result = await extension.worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) throw new Error('No active article tab found.')
      return chrome.tabs.sendMessage(tab.id, {
        type: 'page/translate',
        payload: { targetLang: 'ja' },
      })
    })

    expect(result).toMatchObject({ ok: true, data: { status: 'failed', translatedBlocks: 0 } })
    expect(result.data.failedBlocks).toBe(result.data.totalBlocks)
    await expect(article.locator('[data-lingoflow-translation]')).toHaveCount(0)
    await expect(article.getByRole('heading', { name: originalHeading ?? '' })).toBeVisible()
    expect(articleErrors()).toEqual([])
  } finally {
    await extension.close()
    await articleServer.close()
  }
})

test('installed extension translates GitHub Markdown without duplicate quotes or broken placement', async () => {
  const articleServer = await startArticleServer()
  const extension = await launchExtension({ allowLocalhost: true })

  try {
    const extensionPage = await extension.context.newPage()
    await extensionPage.goto(extension.url('options.html'))
    const saveResponse = await extensionPage.evaluate(async providerBaseUrl => {
      const current = await chrome.runtime.sendMessage({ type: 'settings/get' })
      if (!current?.ok) return current

      return chrome.runtime.sendMessage({
        type: 'settings/save',
        payload: {
          settings: {
            ...current.data,
            cacheEnabled: false,
            defaultProviderId: 'openai-compatible',
            providers: {
              ...current.data.providers,
              'openai-compatible': {
                ...current.data.providers['openai-compatible'],
                values: { baseUrl: providerBaseUrl, apiKey: 'test-only-key', model: 'test-model' },
              },
            },
          },
        },
      })
    }, articleServer.successProviderBaseUrl)
    expect(saveResponse).toMatchObject({ ok: true })

    const page = await extension.context.newPage()
    const pageErrors = collectRuntimeErrors(page)
    await page.goto(articleServer.githubPrUrl)

    await extension.worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) throw new Error('No active GitHub fixture tab found.')
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['lingoflow-content.js'],
      })
    })

    const result = await extension.worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) throw new Error('No active GitHub fixture tab found.')
      return chrome.tabs.sendMessage(tab.id, {
        type: 'page/translate',
        payload: { targetLang: 'ja' },
      })
    })

    expect(result).toMatchObject({ ok: true, data: { status: 'done' } })

    await expect(page.locator('h2', { hasText: 'What' })).toHaveAttribute('data-lingoflow-block-id', /block_/)
    await expect(page.locator('h2', { hasText: 'Why' })).toHaveAttribute('data-lingoflow-block-id', /block_/)
    await expect(page.locator('h2', { hasText: 'Notes' })).toHaveAttribute('data-lingoflow-block-id', /block_/)
    const titleLink = page.locator('h3 a', { hasText: 'homepage status banner' })
    await expect(titleLink).toHaveAttribute('data-lingoflow-block-id', /block_/)
    await expect(page.locator('h3', { hasText: 'homepage status banner' })).not.toHaveAttribute('data-lingoflow-block-id', /block_/)
    await expect(titleLink.locator('[data-lingoflow-translation]').filter({ hasText: 'homepage status banner' })).toHaveCount(1)
    await expect(page.locator('h3 + [data-lingoflow-translation]').filter({ hasText: 'homepage status banner' })).toHaveCount(0)

    const quoteTranslations = page.locator('blockquote [data-lingoflow-translation]').filter({ hasText: 'Public beta' })
    await expect(quoteTranslations).toHaveCount(1)
    await expect(page.locator('blockquote')).not.toHaveAttribute('data-lingoflow-block-id', /block_/)
    await expect(page.locator('blockquote + [data-lingoflow-translation]')).toHaveCount(0)

    await expect(page.locator('[data-lingoflow-translation]').filter({ hasText: 'README.md' })).toHaveCount(1)
    await expect(page.locator('[data-lingoflow-translation]').filter({ hasText: '@vue-tui/runtime' })).toHaveCount(1)
    await expect(page.locator('[data-lingoflow-translation]').filter({ hasText: 'a285a52' })).toHaveCount(1)
    await expect(page.locator('[data-lingoflow-translation]').filter({ hasText: '[[LF' })).toHaveCount(0)

    await expect(page.locator('li > [data-lingoflow-translation]').filter({ hasText: 'workspace command' })).toHaveCount(1)
    await expect(page.locator('td > [data-lingoflow-translation]').filter({ hasText: 'table cell' })).toHaveCount(1)
    expect(pageErrors()).toEqual([])
  } finally {
    await extension.close()
    await articleServer.close()
  }
})

test('installed popup exposes current-site cache cleanup', async () => {
  const extension = await launchExtension()

  try {
    const popup = await extension.context.newPage()
    await popup.goto(extension.url('popup.html'))

    await expect(popup.getByRole('button', { name: "Clear this site's cache" })).toBeVisible()
  } finally {
    await extension.close()
  }
})

test('installed extension reuses cache and current-site cleanup forces a fresh provider request', async () => {
  const articleServer = await startArticleServer()
  const extension = await launchExtension({ allowLocalhost: true })

  try {
    const extensionPage = await extension.context.newPage()
    await extensionPage.goto(extension.url('options.html'))
    const saveResponse = await extensionPage.evaluate(async providerBaseUrl => {
      const current = await chrome.runtime.sendMessage({ type: 'settings/get' })
      if (!current?.ok) return current

      return chrome.runtime.sendMessage({
        type: 'settings/save',
        payload: {
          settings: {
            ...current.data,
            cacheEnabled: true,
            defaultProviderId: 'openai-compatible',
            providers: {
              ...current.data.providers,
              'openai-compatible': {
                ...current.data.providers['openai-compatible'],
                values: { baseUrl: providerBaseUrl, apiKey: 'test-only-key', model: 'test-model' },
              },
            },
          },
        },
      })
    }, articleServer.successProviderBaseUrl)
    expect(saveResponse).toMatchObject({ ok: true })

    const article = await extension.context.newPage()
    await article.goto(articleServer.url)
    const injectContentRuntime = () => extension.worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) throw new Error('No active article tab found.')
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['lingoflow-content.js'],
      })
    })
    await injectContentRuntime()

    const translate = () => extension.worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) throw new Error('No active article tab found.')
      return chrome.tabs.sendMessage(tab.id, {
        type: 'page/translate',
        payload: { targetLang: 'ja' },
      })
    })

    const originalParagraph = await article.locator('article p').first().textContent()
    const first = await translate()
    expect(first).toMatchObject({ ok: true, data: { status: 'done', cacheHits: 0 } })
    expect(articleServer.providerRequestCount()).toBe(1)
    await expect(article.locator('[data-lingoflow-translation]')).toHaveCount(first.data.totalBlocks)

    const popup = await extension.context.newPage()
    await popup.goto(extension.url('popup.html'))
    await article.bringToFront()
    await popup.getByRole('button', { name: 'Clear translation' }).click()
    await expect(article.locator('[data-lingoflow-translation]')).toHaveCount(0)
    await expect(article.locator('article p').first()).toHaveText(originalParagraph ?? '')

    const second = await translate()
    expect(second).toMatchObject({
      ok: true,
      data: {
        status: 'done',
        cacheHits: first.data.totalBlocks,
      },
    })
    expect(articleServer.providerRequestCount()).toBe(1)

    await article.reload()
    await injectContentRuntime()
    const refreshed = await translate()
    expect(refreshed).toMatchObject({
      ok: true,
      data: {
        status: 'done',
        cacheHits: first.data.totalBlocks,
      },
    })
    expect(articleServer.providerRequestCount()).toBe(1)

    await article.bringToFront()
    await popup.getByRole('button', { name: "Clear this site's cache" }).click()
    await expect(popup.getByText("This site's translation cache was cleared")).toBeVisible()

    const third = await translate()
    expect(third).toMatchObject({ ok: true, data: { status: 'done', cacheHits: 0 } })
    expect(articleServer.providerRequestCount()).toBe(2)

    await extensionPage.getByRole('button', { name: 'Storage' }).click()
    await extensionPage.getByRole('button', { name: 'Clear all cache' }).click()
    await extensionPage.getByRole('button', { name: 'Confirm clear all cache' }).click()
    await expect(extensionPage.getByText('All translation cache cleared')).toBeVisible()

    const afterClearAll = await translate()
    expect(afterClearAll).toMatchObject({ ok: true, data: { status: 'done', cacheHits: 0 } })
    expect(articleServer.providerRequestCount()).toBe(3)
  } finally {
    await extension.close()
    await articleServer.close()
  }
})

test('production build manifest does not contain test-only host permissions', () => {
  const manifest = JSON.parse(readFileSync(path.join(builtExtensionPath, 'manifest.json'), 'utf-8'))

  expect(manifest.host_permissions).not.toContain(expect.stringMatching(/127\.0\.0\.1/))
  expect(manifest.host_permissions).not.toContain(expect.stringMatching(/<all_urls>/))
  expect(manifest.host_permissions).toEqual(
    expect.arrayContaining(['https://translate.googleapis.com/*']),
  )
  expect(manifest.permissions).not.toContain(expect.stringMatching(/<all_urls>/))
  expect(manifest.optional_host_permissions).toEqual(
    expect.arrayContaining(['https://*/*', 'http://*/*']),
  )
  expect(manifest.optional_host_permissions).not.toContain(expect.stringMatching(/<all_urls>/))
})

test('production content script contains no Unicode noncharacters', () => {
  const contentScript = readFileSync(path.join(builtExtensionPath, 'lingoflow-content.js'), 'utf-8')

  expect(contentScript).not.toContain('\uFFFF')
  expect(contentScript).not.toContain('__lingoflowInspectDom')
  expect(contentScript).not.toContain(LINGOFLOW_DEV_INSPECT_MARKER)
})

test('production build omits the dev inspector console bridge', () => {
  for (const file of readBuiltJavaScriptFiles()) {
    expect(file.content, file.path).not.toContain('__lingoflowInspectDom')
    expect(file.content, file.path).not.toContain(LINGOFLOW_DEV_INSPECT_MARKER)
  }
})

test('installed extension translates representative public reading pages', async () => {
  test.skip(process.env.LINGOFLOW_PUBLIC_E2E !== '1', 'Set LINGOFLOW_PUBLIC_E2E=1 to run public-page acceptance.')
  test.setTimeout(180_000)

  const publicPages = [
    { name: 'Wikipedia article', url: 'https://en.wikipedia.org/wiki/Translation' },
    { name: 'MDN documentation', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Document' },
    { name: 'GitHub README', url: 'https://github.com/vuejs/core' },
    { name: 'News article', url: 'https://www.theguardian.com/world/2026/jun/13/ecuador-fishing-boats-us-strikes' },
    { name: 'Technical blog', url: 'https://webkit.org/blog/17967/news-from-wwdc26-webkit-in-safari-27-beta/' },
    { name: 'Chinese page', url: 'https://zh.wikipedia.org/wiki/%E7%BF%BB%E8%AF%91' },
    { name: 'Code-heavy page', url: 'https://docs.python.org/3/tutorial/controlflow.html' },
  ]
  const articleServer = await startArticleServer()
  const extension = await launchExtension({
    allowLocalhost: true,
    extraHostPermissions: publicPages.map(page => `${new URL(page.url).origin}/*`),
  })

  try {
    const extensionPage = await extension.context.newPage()
    await extensionPage.goto(extension.url('options.html'))
    const saveResponse = await extensionPage.evaluate(async providerBaseUrl => {
      const current = await chrome.runtime.sendMessage({ type: 'settings/get' })
      if (!current?.ok) return current

      return chrome.runtime.sendMessage({
        type: 'settings/save',
        payload: {
          settings: {
            ...current.data,
            cacheEnabled: false,
            defaultProviderId: 'openai-compatible',
            providers: {
              ...current.data.providers,
              'openai-compatible': {
                ...current.data.providers['openai-compatible'],
                values: { baseUrl: providerBaseUrl, apiKey: 'test-only-key', model: 'test-model' },
              },
            },
          },
        },
      })
    }, articleServer.successProviderBaseUrl)
    expect(saveResponse).toMatchObject({ ok: true })

    for (const publicPage of publicPages) {
      await test.step(publicPage.name, async () => {
        const page = await extension.context.newPage()
        const runtimeErrors = collectRuntimeErrors(page)

        try {
          await gotoPublicPage(page, publicPage.url)
          await extension.worker.evaluate(async () => {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
            if (!tab?.id) throw new Error('No active public-page tab found.')
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['lingoflow-content.js'],
            })
          })

          const result = await extension.worker.evaluate(async () => {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
            if (!tab?.id) throw new Error('No active public-page tab found.')
            return chrome.tabs.sendMessage(tab.id, {
              type: 'page/translate',
              payload: { targetLang: 'ja' },
            })
          })

          expect(result).toMatchObject({ ok: true })
          expect(result.data.totalBlocks).toBeGreaterThan(0)
          expect(result.data.translatedBlocks).toBeGreaterThan(0)
          await expect.poll(() => page.locator('[data-lingoflow-translation]').count()).toBeGreaterThan(0)
          expect(await page.locator('code [data-lingoflow-translation], pre [data-lingoflow-translation]').count()).toBe(0)
          expect(runtimeErrors()).toEqual([])
        } finally {
          await page.close()
        }
      })
    }
  } finally {
    await extension.close()
    await articleServer.close()
  }
})

type ExtensionOptions = {
  allowLocalhost?: boolean
  extraHostPermissions?: string[]
}

async function launchExtension(options: ExtensionOptions = {}) {
  const extensionDir = options.allowLocalhost || options.extraHostPermissions?.length
    ? prepareTestExtensionDir(options)
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
      if (extensionDir !== builtExtensionPath) {
        rmSync(extensionDir, { recursive: true, force: true })
      }
    },
  }
}

// Creates a temporary extension directory with the production build files
// and a patched manifest that adds a localhost host permission for content-script injection E2E.
// The production manifest is never modified.
function prepareTestExtensionDir(options: ExtensionOptions): string {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'lingoflow-ext-test-'))

  cpSync(builtExtensionPath, tmpDir, { recursive: true })

  // Patch only the temporary E2E copy with the exact hosts needed by the scenario.
  const manifestPath = path.join(tmpDir, 'manifest.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
  if (options.allowLocalhost) manifest.host_permissions.push('http://127.0.0.1:*/*')
  manifest.host_permissions.push(...(options.extraHostPermissions ?? []))
  manifest.host_permissions = [...new Set(manifest.host_permissions)]
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))

  return tmpDir
}

function startArticleServer() {
  let providerRequestCount = 0
  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1')

    if (request.method === 'POST' && requestUrl.pathname.endsWith('/v1/chat/completions')) {
      providerRequestCount += 1
      const chunks: Uint8Array[] = []
      for await (const chunk of request) chunks.push(chunk)
      const requestBody = JSON.parse(Buffer.concat(chunks).toString('utf-8'))
      const prompt = JSON.parse(requestBody.messages?.[1]?.content ?? '{}')
      const texts = Array.isArray(prompt.texts) ? prompt.texts.map(String) : []
      const slow = requestUrl.pathname.startsWith('/slow/')
      const success = requestUrl.pathname.startsWith('/success/')
      const invalid = requestUrl.pathname.startsWith('/invalid/')
      if (slow) await new Promise(resolve => setTimeout(resolve, 4_500))
      if (invalid) {
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({
          choices: [{ message: { content: 'not valid translation JSON' } }],
        }))
        return
      }
      const shouldFail =
        !slow &&
        !success &&
        (texts.length > 1 ||
          texts.some((text: string) => text.includes('avoid touching controls')))

      if (shouldFail) {
        response.writeHead(500, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ error: { message: 'Intentional mixed-result fixture failure' } }))
        return
      }

      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(texts.map((text: string) => `訳: ${text}`)) } }],
      }))
      return
    }

    if (request.method === 'POST' && requestUrl.pathname === '/azure/translate') {
      const chunks: Uint8Array[] = []
      for await (const chunk of request) chunks.push(chunk)
      const requestBody = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as Array<{ text?: string }>

      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify(requestBody.map(item => ({
        translations: [{ text: `AZ: ${item.text ?? ''}` }],
      }))))
      return
    }

    if (request.method === 'GET' && requestUrl.pathname === '/github-pr.html') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      response.end(`<!doctype html>
<html lang="en">
  <head>
    <title>GitHub PR Fixture</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 40px; max-width: 840px; }
      .markdown-body { line-height: 1.55; }
      table { border-collapse: collapse; }
      td { border: 1px solid #d0d7de; padding: 8px; }
    </style>
  </head>
  <body>
    <main>
      <div class="feed-card">
        <h3 class="lh-condensed">
          <a class="Link--primary Link text-bold" href="/vuejs-ai/vue-tui/pull/208">
            docs(readme): align the homepage status banner with the public-beta message
            <span class="f3-light color-fg-muted">#208</span>
          </a>
        </h3>
      </div>
      <div class="comment-body markdown-body js-comment-body">
        <h2 dir="auto">What</h2>
        <p dir="auto">The top-level <code class="notranslate">README.md</code> carried a terser banner:</p>
        <blockquote>
          <p dir="auto"><strong>Public beta</strong> - the <code class="notranslate">@vue-tui/runtime</code> API is stabilizing, and we're now seeking public feedback to lock it down before 1.0.</p>
        </blockquote>
        <p dir="auto">The runtime banner was tightened in <a href="https://github.com/example/repo/commit/a285a523f979213a205fa7008b07927482c76763">a285a52</a> before release.</p>
        <h2 dir="auto">Why</h2>
        <ul>
          <li>Use the workspace command from the repository root when running extension tests.</li>
        </ul>
        <table>
          <tbody>
            <tr>
              <td><p>This table cell paragraph is long enough to translate but must stay inside the table cell.</p></td>
            </tr>
          </tbody>
        </table>
        <h2 dir="auto">Notes</h2>
        <p dir="auto">Docs-only, single-line change. No code or behavior affected.</p>
        <pre><code>const shouldNotTranslate = true</code></pre>
      </div>
    </main>
  </body>
</html>`)
      return
    }

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

  return new Promise<{
    url: string
    providerBaseUrl: string
    successProviderBaseUrl: string
    invalidProviderBaseUrl: string
    slowProviderBaseUrl: string
    azureProviderEndpoint: string
    githubPrUrl: string
    providerRequestCount: () => number
    close: () => Promise<void>
  }>(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('Article server did not start.')
      const origin = `http://127.0.0.1:${address.port}`

      resolve({
        url: `${origin}/article.html`,
        providerBaseUrl: `${origin}/v1`,
        successProviderBaseUrl: `${origin}/success/v1`,
        invalidProviderBaseUrl: `${origin}/invalid/v1`,
        slowProviderBaseUrl: `${origin}/slow/v1`,
        azureProviderEndpoint: `${origin}/azure`,
        githubPrUrl: `${origin}/github-pr.html`,
        providerRequestCount: () => providerRequestCount,
        close: () => new Promise<void>(r => server.close(() => r())),
      })
    })
  })
}

async function gotoPublicPage(page: Page, url: string) {
  let lastError: unknown

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
      return
    } catch (error) {
      lastError = error
      if (attempt < 3) await page.waitForTimeout(1_000)
    }
  }

  throw lastError
}

function readBuiltJavaScriptFiles(dir = builtExtensionPath): Array<{ path: string, content: string }> {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const filePath = path.join(dir, entry.name)
    if (entry.isDirectory()) return readBuiltJavaScriptFiles(filePath)
    if (!entry.isFile() || !entry.name.endsWith('.js')) return []
    return [{ path: filePath, content: readFileSync(filePath, 'utf-8') }]
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
