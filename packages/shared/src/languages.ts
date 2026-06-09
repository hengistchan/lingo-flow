import type { LanguageOption, UiLocale } from '@lingoflow/types'

const FALLBACK_LANGUAGE = 'zh-Hans'

export const LANGUAGE_OPTIONS: readonly LanguageOption[] = [
  {
    code: 'auto',
    englishName: 'Auto-detect',
    nativeName: 'Auto-detect',
    simplifiedChineseName: '自动检测',
    supportsSource: true,
    supportsTarget: false,
  },
  {
    code: 'zh-Hans',
    englishName: 'Simplified Chinese',
    nativeName: '简体中文',
    simplifiedChineseName: '简体中文',
    supportsSource: true,
    supportsTarget: true,
  },
  {
    code: 'zh-Hant',
    englishName: 'Traditional Chinese',
    nativeName: '繁體中文',
    simplifiedChineseName: '繁体中文',
    supportsSource: true,
    supportsTarget: true,
  },
  {
    code: 'en',
    englishName: 'English',
    nativeName: 'English',
    simplifiedChineseName: '英语',
    supportsSource: true,
    supportsTarget: true,
  },
  {
    code: 'ja',
    englishName: 'Japanese',
    nativeName: '日本語',
    simplifiedChineseName: '日语',
    supportsSource: true,
    supportsTarget: true,
  },
  {
    code: 'ko',
    englishName: 'Korean',
    nativeName: '한국어',
    simplifiedChineseName: '韩语',
    supportsSource: true,
    supportsTarget: true,
  },
  {
    code: 'es',
    englishName: 'Spanish',
    nativeName: 'Español',
    simplifiedChineseName: '西班牙语',
    supportsSource: true,
    supportsTarget: true,
  },
  {
    code: 'fr',
    englishName: 'French',
    nativeName: 'Français',
    simplifiedChineseName: '法语',
    supportsSource: true,
    supportsTarget: true,
  },
  {
    code: 'de',
    englishName: 'German',
    nativeName: 'Deutsch',
    simplifiedChineseName: '德语',
    supportsSource: true,
    supportsTarget: true,
  },
  {
    code: 'pt',
    englishName: 'Portuguese',
    nativeName: 'Português',
    simplifiedChineseName: '葡萄牙语',
    supportsSource: true,
    supportsTarget: true,
  },
  {
    code: 'it',
    englishName: 'Italian',
    nativeName: 'Italiano',
    simplifiedChineseName: '意大利语',
    supportsSource: true,
    supportsTarget: true,
  },
  {
    code: 'ru',
    englishName: 'Russian',
    nativeName: 'Русский',
    simplifiedChineseName: '俄语',
    supportsSource: true,
    supportsTarget: true,
  },
  {
    code: 'ar',
    englishName: 'Arabic',
    nativeName: 'العربية',
    simplifiedChineseName: '阿拉伯语',
    supportsSource: true,
    supportsTarget: true,
  },
]

export function getLanguageLabel(code: string, locale: UiLocale): string {
  const option = LANGUAGE_OPTIONS.find(language => language.code === code)
  if (!option) return code
  return locale === 'zh-Hans' ? option.simplifiedChineseName : option.englishName
}

export function getSourceLanguageOptions(): LanguageOption[] {
  return LANGUAGE_OPTIONS.filter(option => option.supportsSource)
}

export function getTargetLanguageOptions(): LanguageOption[] {
  return LANGUAGE_OPTIONS.filter(option => option.supportsTarget)
}

export function resolveSupportedLanguage(code: string, fallback = FALLBACK_LANGUAGE): string {
  if (LANGUAGE_OPTIONS.some(option => option.code === code)) return code
  if (LANGUAGE_OPTIONS.some(option => option.code === fallback)) return fallback
  return FALLBACK_LANGUAGE
}

export function resolveUiLocale(browserLanguage = 'en'): UiLocale {
  return browserLanguage.toLowerCase().startsWith('zh') ? 'zh-Hans' : 'en'
}
