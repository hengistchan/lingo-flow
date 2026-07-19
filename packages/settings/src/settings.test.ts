import { DEFAULT_SETTINGS, getPublicRuntimeSettings, migrateSettings } from './index'
import type { SiteRule, UserSiteRule } from '@lingoflow/types'

describe('settings', () => {
  it('defaults to auto-detect, Simplified Chinese, and Google Free provider', () => {
    expect(DEFAULT_SETTINGS.sourceLang).toBe('auto')
    expect(DEFAULT_SETTINGS.targetLang).toBe('zh-Hans')
    expect(DEFAULT_SETTINGS.renderMode).toBe('below-original')
    expect(DEFAULT_SETTINGS.defaultProviderId).toBe('google-free-translate')
    expect(DEFAULT_SETTINGS.translationConcurrency).toBe(3)
    expect(DEFAULT_SETTINGS.userRules).toEqual([])
    expect(DEFAULT_SETTINGS.providers['google-free-translate']).toMatchObject({
      id: 'google-free-translate',
      presetId: 'google-free-translate',
      name: 'Google Translate Free (experimental)',
      values: {},
    })
  })

  it('migrates the legacy unversioned English source default to auto-detect', () => {
    const migrated = migrateSettings({
      sourceLang: 'en',
      targetLang: 'ja',
    })

    expect(migrated.sourceLang).toBe('auto')
    expect(migrated.targetLang).toBe('ja')
    expect(migrated.userRules).toEqual([])
    expect(migrated.version).toBe(DEFAULT_SETTINGS.version)
  })

  it('migrates existing settings to userRules without changing saved preferences or provider secrets', () => {
    const migrated = migrateSettings({
      version: DEFAULT_SETTINGS.version - 1,
      interfaceLocale: 'en',
      uiTheme: 'dark',
      sourceLang: 'ja',
      targetLang: 'fr',
      cacheEnabled: false,
      maxCacheItems: 321,
      translationConcurrency: 4,
      defaultProviderId: 'openai-compatible',
      fallbackProviderId: 'azure-translator',
      providers: {
        'openai-compatible': {
          id: 'openai-compatible',
          presetId: 'openai-compatible',
          name: 'OpenAI-compatible',
          values: {
            baseUrl: 'https://api.openai.com/v1',
            apiKey: 'secret-openai-key',
            model: 'gpt-4.1-mini',
            reasoningEffort: 'low',
            disableThinking: 'true',
          },
        },
        'azure-translator': {
          id: 'azure-translator',
          presetId: 'azure-translator',
          name: 'Azure Translator',
          values: {
            endpoint: 'https://example.cognitiveservices.azure.com',
            key: 'secret-azure-key',
            region: 'eastasia',
          },
        },
      },
    })

    expect(migrated).toMatchObject({
      interfaceLocale: 'en',
      uiTheme: 'dark',
      sourceLang: 'ja',
      targetLang: 'fr',
      cacheEnabled: false,
      maxCacheItems: 321,
      translationConcurrency: 4,
      defaultProviderId: 'openai-compatible',
      fallbackProviderId: 'azure-translator',
      userRules: [],
    })
    expect(migrated.providers['openai-compatible'].values.apiKey).toBe('secret-openai-key')
    expect(migrated.providers['azure-translator'].values.key).toBe('secret-azure-key')
  })

  it('Migrates version 0 settings with legacy sourceLang en to auto', () => {
    const migrated = migrateSettings({
      version: 0,
      sourceLang: 'en',
      targetLang: 'ja',
    })

    expect(migrated.sourceLang).toBe('auto')
    expect(migrated.targetLang).toBe('ja')
    expect(migrated.version).toBe(DEFAULT_SETTINGS.version)
  })

  it('Does not re-migrate version 1 settings', () => {
    const migrated = migrateSettings({
      version: 1,
      sourceLang: 'ja',
      targetLang: 'en',
    })

    expect(migrated.sourceLang).toBe('ja')
    expect(migrated.version).toBe(DEFAULT_SETTINGS.version)
  })

  it('Handles undefined version as version 0', () => {
    const migrated = migrateSettings({
      sourceLang: 'en',
      targetLang: 'ja',
    })

    expect(migrated.sourceLang).toBe('auto')
    expect(migrated.version).toBe(DEFAULT_SETTINGS.version)
  })

  it('public runtime settings omit provider API keys', () => {
    const runtime = getPublicRuntimeSettings({
      ...DEFAULT_SETTINGS,
      providers: {
        'azure-translator': {
          id: 'azure-translator',
          presetId: 'azure-translator',
          name: 'Azure Translator',
          values: {
            endpoint: 'https://api.cognitive.microsofttranslator.com',
            key: 'secret-azure-key',
            region: 'eastasia',
          },
        },
        'openai-compatible': {
          id: 'openai-compatible',
          presetId: 'openai-compatible',
          name: 'OpenAI-compatible',
          values: {
            baseUrl: 'https://api.openai.com/v1',
            apiKey: 'secret-openai-key',
            model: 'gpt-4o-mini',
          },
        },
      },
    })

    expect(JSON.stringify(runtime)).not.toContain('secret')
    expect(runtime.providerId).toBe('google-free-translate')
    expect(runtime.translationConcurrency).toBe(3)
  })

  it('public runtime settings expose only enabled user rules without provider secrets', () => {
    const enabledRule: UserSiteRule = {
      id: 'user:docs',
      version: 1,
      source: 'user',
      enabled: true,
      createdAt: '2026-06-22T00:00:00.000Z',
      updatedAt: '2026-06-22T00:00:00.000Z',
      priority: 50,
      match: { matches: ['https://example.com/docs/*'] },
      selectors: { contentRoots: ['main.docs'] },
    }
    const disabledRule: UserSiteRule = {
      ...enabledRule,
      id: 'user:disabled',
      enabled: false,
      match: { matches: ['https://example.com/disabled/*'] },
    }

    const runtime = getPublicRuntimeSettings({
      ...DEFAULT_SETTINGS,
      defaultProviderId: 'openai-compatible',
      userRules: [enabledRule, disabledRule],
      providers: {
        ...DEFAULT_SETTINGS.providers,
        'openai-compatible': {
          id: 'openai-compatible',
          presetId: 'openai-compatible',
          name: 'OpenAI-compatible',
          values: {
            baseUrl: 'https://api.openai.com/v1',
            apiKey: 'secret-openai-key',
            model: 'gpt-4.1-mini',
          },
        },
      },
    })

    expect(runtime.userRules).toEqual([enabledRule])
    expect(JSON.stringify(runtime)).not.toContain('secret-openai-key')
  })

  it('keeps SiteRule for bundled rules separate from persisted UserSiteRule', () => {
    const builtInRule = {
      id: 'github-markdown',
      version: 1,
      source: 'built-in',
      priority: 20,
      match: { matches: ['*://github.com/*'] },
      selectors: { contentRoots: ['.markdown-body'] },
    } satisfies SiteRule

    const userRule = {
      id: 'user:github-markdown',
      version: 1,
      source: 'user',
      enabled: true,
      createdAt: '2026-06-22T00:00:00.000Z',
      updatedAt: '2026-06-22T00:00:00.000Z',
      priority: 80,
      match: { matches: ['*://github.com/*'] },
      selectors: { excludeSelectors: ['.file-navigation'] },
    } satisfies UserSiteRule

    expect('enabled' in builtInRule).toBe(false)
    expect(userRule.enabled).toBe(true)
  })

  it('clamps translation concurrency to a safe range', () => {
    expect(migrateSettings({ translationConcurrency: 0 }).translationConcurrency).toBe(1)
    expect(migrateSettings({ translationConcurrency: 20 }).translationConcurrency).toBe(6)
    expect(migrateSettings({ translationConcurrency: 4 }).translationConcurrency).toBe(4)
  })

  it('preserves custom provider configurations across save migrations', () => {
    const customProviderId = 'custom-local-llm'
    const migrated = migrateSettings({
      ...DEFAULT_SETTINGS,
      defaultProviderId: customProviderId,
      providers: {
        ...DEFAULT_SETTINGS.providers,
        [customProviderId]: {
          id: customProviderId,
          presetId: 'openai-compatible',
          name: 'Local LLM',
          values: {
            baseUrl: 'http://localhost:11434/v1',
            apiKey: '',
            model: 'qwen3',
          },
        },
      },
    })

    expect(migrated.defaultProviderId).toBe(customProviderId)
    expect(migrated.providers[customProviderId]).toEqual({
      id: customProviderId,
      presetId: 'openai-compatible',
      name: 'Local LLM',
      values: {
        baseUrl: 'http://localhost:11434/v1',
        apiKey: '',
        model: 'qwen3',
      },
    })
  })

  it('drops malformed provider entries without breaking valid settings', () => {
    const migrated = migrateSettings({
      ...DEFAULT_SETTINGS,
      providers: {
        ...DEFAULT_SETTINGS.providers,
        broken: 'not-a-provider',
      },
    })

    expect(migrated.providers.broken).toBeUndefined()
    expect(migrated.providers['google-free-translate']).toEqual(DEFAULT_SETTINGS.providers['google-free-translate'])
  })
})
