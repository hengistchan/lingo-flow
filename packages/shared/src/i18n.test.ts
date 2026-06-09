import { t } from './index'

describe('shared interface copy', () => {
  it('returns localized copy and interpolates variables', () => {
    expect(t('zh-Hans', 'popup.autoDetect')).toBe('自动检测网页语言')
    expect(t('zh-Hans', 'popup.translateTo', { language: '日语' })).toBe('翻译为日语')
    expect(t('en', 'popup.translateTo', { language: 'Japanese' })).toBe('Translate to Japanese')
  })

  it('falls back to English for unsupported interface locales', () => {
    expect(t('unsupported', 'popup.settings')).toBe('Settings')
  })
})
