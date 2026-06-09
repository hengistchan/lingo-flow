import {
  getLanguageLabel,
  getSourceLanguageOptions,
  getTargetLanguageOptions,
  resolveSupportedLanguage,
  resolveUiLocale,
} from './index'

describe('shared language catalog', () => {
  it('shows localized human-readable language names', () => {
    expect(getLanguageLabel('zh-Hans', 'zh-Hans')).toBe('简体中文')
    expect(getLanguageLabel('ja', 'en')).toBe('Japanese')
    expect(getLanguageLabel('ja', 'zh-Hans')).toBe('日语')
  })

  it('keeps auto-detect source-only and falls back safely', () => {
    expect(resolveSupportedLanguage('unsupported', 'zh-Hans')).toBe('zh-Hans')
    expect(getTargetLanguageOptions().some(option => option.code === 'auto')).toBe(false)
    expect(getSourceLanguageOptions()[0]?.code).toBe('auto')
  })

  it('resolves supported interface locales from browser language tags', () => {
    expect(resolveUiLocale('zh-TW')).toBe('zh-Hans')
    expect(resolveUiLocale('en-US')).toBe('en')
    expect(resolveUiLocale('fr-FR')).toBe('en')
  })
})
