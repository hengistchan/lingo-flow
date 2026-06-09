import { DEFAULT_SETTINGS, getSettingsSummary } from './index'

describe('key-free settings summary', () => {
  it('reports configured Azure without exposing provider keys', () => {
    const summary = getSettingsSummary({
      ...DEFAULT_SETTINGS,
      providers: {
        ...DEFAULT_SETTINGS.providers,
        azure: {
          endpoint: 'https://api.cognitive.microsofttranslator.com',
          key: 'secret-azure-key',
          region: 'eastasia',
        },
      },
    })

    expect(summary).toMatchObject({
      sourceLang: 'auto',
      targetLang: 'zh-Hans',
      providerId: 'azure-translator',
      providerName: 'Azure Translator',
      providerConfigured: true,
    })
    expect(JSON.stringify(summary)).not.toContain('secret-azure-key')
  })

  it('reports incomplete selected provider configuration', () => {
    expect(getSettingsSummary(DEFAULT_SETTINGS).providerConfigured).toBe(false)

    expect(
      getSettingsSummary({
        ...DEFAULT_SETTINGS,
        defaultProviderId: 'openai-compatible',
      }).providerConfigured,
    ).toBe(false)
  })
})
