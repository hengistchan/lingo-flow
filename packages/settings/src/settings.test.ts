import { DEFAULT_SETTINGS, getPublicRuntimeSettings } from './index'

describe('settings', () => {
  it('defaults to Simplified Chinese below-original rendering and Azure provider', () => {
    expect(DEFAULT_SETTINGS.targetLang).toBe('zh-Hans')
    expect(DEFAULT_SETTINGS.renderMode).toBe('below-original')
    expect(DEFAULT_SETTINGS.defaultProviderId).toBe('azure-translator')
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
