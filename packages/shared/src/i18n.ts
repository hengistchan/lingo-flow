import type { UiLocale } from '@lingoflow/types'
import { resolveUiLocale } from './languages'

export type UiCopyKey =
  | 'popup.autoDetect'
  | 'popup.translateTo'
  | 'popup.translateAgain'
  | 'popup.translatingTo'
  | 'popup.providerNotConfigured'
  | 'popup.configureProvider'
  | 'popup.clearTranslation'
  | 'popup.clearSiteCache'
  | 'popup.settings'
  | 'options.languages'
  | 'options.providers'
  | 'options.storage'
  | 'options.advanced'
  | 'options.save'
  | 'options.testConnection'

const COPY: Record<UiLocale, Record<UiCopyKey, string>> = {
  'zh-Hans': {
    'popup.autoDetect': '自动检测网页语言',
    'popup.translateTo': '翻译为{language}',
    'popup.translateAgain': '重新翻译为{language}',
    'popup.translatingTo': '正在翻译为{language}',
    'popup.providerNotConfigured': '尚未配置翻译服务',
    'popup.configureProvider': '配置翻译服务',
    'popup.clearTranslation': '清除译文',
    'popup.clearSiteCache': '清除此网站的缓存',
    'popup.settings': '设置',
    'options.languages': '语言',
    'options.providers': '翻译服务',
    'options.storage': '存储',
    'options.advanced': '高级设置',
    'options.save': '保存设置',
    'options.testConnection': '测试连接',
  },
  en: {
    'popup.autoDetect': 'Auto-detect page language',
    'popup.translateTo': 'Translate to {language}',
    'popup.translateAgain': 'Translate again in {language}',
    'popup.translatingTo': 'Translating to {language}',
    'popup.providerNotConfigured': 'Translation service is not configured',
    'popup.configureProvider': 'Configure translation service',
    'popup.clearTranslation': 'Clear translation',
    'popup.clearSiteCache': "Clear this site's cache",
    'popup.settings': 'Settings',
    'options.languages': 'Languages',
    'options.providers': 'Translation service',
    'options.storage': 'Storage',
    'options.advanced': 'Advanced',
    'options.save': 'Save settings',
    'options.testConnection': 'Test connection',
  },
}

export function t(
  locale: UiLocale | string,
  key: UiCopyKey,
  variables: Record<string, string | number> = {},
): string {
  const template = COPY[resolveUiLocale(locale)][key] ?? COPY.en[key]
  return template.replace(/\{(\w+)\}/g, (_, variable: string) => String(variables[variable] ?? `{${variable}}`))
}
