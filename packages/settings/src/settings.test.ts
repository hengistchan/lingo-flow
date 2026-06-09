import { DEFAULT_SETTINGS, getPublicRuntimeSettings, migrateSettings } from './index'

describe('settings', () => {
  it('defaults to auto-detect, Simplified Chinese, and Azure provider', () => {
    expect(DEFAULT_SETTINGS.sourceLang).toBe('auto')
    expect(DEFAULT_SETTINGS.targetLang).toBe('zh-Hans')
    expect(DEFAULT_SETTINGS.renderMode).toBe('below-original')
    expect(DEFAULT_SETTINGS.defaultProviderId).toBe('azure-translator')
  })

  it('migrates the legacy unversioned English source default to auto-detect', () => {
    const migrated = migrateSettings({
      sourceLang: 'en',
      targetLang: 'ja',
    })

    expect(migrated.sourceLang).toBe('auto')
    expect(migrated.targetLang).toBe('ja')
    expect(migrated.version).toBe(DEFAULT_SETTINGS.version)
  })

  it('public runtime settings omit provider API keys', () => {
    const runtime = getPublicRuntimeSettings({
      ...DEFAULT_SETTINGS,
      providers: {
        azure: {
          endpoint: 'https://api.cognitive.microsofttranslator.com',
          key: 'secret-azure-key',
          region: 'eastasia',
        },
        openai: {
          baseUrl: 'https://api.openai.com/v1',
          apiKey: 'secret-openai-key',
          model: 'gpt-4o-mini',
        },
      },
    })

    expect(JSON.stringify(runtime)).not.toContain('secret')
    expect(runtime.providerId).toBe('azure-translator')
  })
})
