import { DEFAULT_SETTINGS, getPublicRuntimeSettings, migrateSettings } from './index'

describe('settings', () => {
  it('defaults to auto-detect, Simplified Chinese, and Azure provider', () => {
    expect(DEFAULT_SETTINGS.sourceLang).toBe('auto')
    expect(DEFAULT_SETTINGS.targetLang).toBe('zh-Hans')
    expect(DEFAULT_SETTINGS.renderMode).toBe('below-original')
    expect(DEFAULT_SETTINGS.defaultProviderId).toBe('azure-translator')
    expect(DEFAULT_SETTINGS.translationConcurrency).toBe(3)
    expect(DEFAULT_SETTINGS.providers['google-free-translate']).toMatchObject({
      id: 'google-free-translate',
      presetId: 'google-free-translate',
      name: 'Google Translate Free',
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
    expect(migrated.version).toBe(DEFAULT_SETTINGS.version)
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
    expect(runtime.providerId).toBe('azure-translator')
    expect(runtime.translationConcurrency).toBe(3)
  })

  it('clamps translation concurrency to a safe range', () => {
    expect(migrateSettings({ translationConcurrency: 0 }).translationConcurrency).toBe(1)
    expect(migrateSettings({ translationConcurrency: 20 }).translationConcurrency).toBe(6)
    expect(migrateSettings({ translationConcurrency: 4 }).translationConcurrency).toBe(4)
  })
})
