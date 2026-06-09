import type { UiLocale } from '@lingoflow/types'
import { resolveUiLocale } from './languages'

export type UiCopyKey =
  | 'popup.autoDetect'
  | 'popup.ready'
  | 'popup.translating'
  | 'popup.complete'
  | 'popup.partial'
  | 'popup.failed'
  | 'popup.targetLanguage'
  | 'popup.translateTo'
  | 'popup.translateAgain'
  | 'popup.translatingTo'
  | 'popup.providerNotConfigured'
  | 'popup.configureProvider'
  | 'popup.clearTranslation'
  | 'popup.clearSiteCache'
  | 'popup.settings'
  | 'popup.progress'
  | 'popup.failedBlocks'
  | 'popup.noReadableText'
  | 'popup.genericFailure'
  | 'options.languages'
  | 'options.providers'
  | 'options.storage'
  | 'options.advanced'
  | 'options.title'
  | 'options.subtitle'
  | 'options.save'
  | 'options.saved'
  | 'options.testConnection'
  | 'options.targetLanguage'
  | 'options.sourceLanguage'
  | 'options.interfaceLanguage'
  | 'options.followBrowser'
  | 'options.autoDetect'
  | 'options.defaultProvider'
  | 'options.fallbackProvider'
  | 'options.none'
  | 'options.providerConfigured'
  | 'options.providerIncomplete'
  | 'options.azure'
  | 'options.openAI'
  | 'options.region'
  | 'options.apiKey'
  | 'options.cacheEnabled'
  | 'options.clearAllCache'
  | 'options.cacheCleared'
  | 'options.renderMode'
  | 'options.belowOriginal'
  | 'options.maxCacheItems'
  | 'options.azureEndpoint'
  | 'options.openAIBaseUrl'
  | 'options.model'

const COPY: Record<UiLocale, Record<UiCopyKey, string>> = {
  'zh-Hans': {
    'popup.autoDetect': '自动检测网页语言',
    'popup.ready': '可开始翻译',
    'popup.translating': '正在翻译',
    'popup.complete': '翻译完成',
    'popup.partial': '部分内容未能翻译',
    'popup.failed': '翻译失败',
    'popup.targetLanguage': '目标语言',
    'popup.translateTo': '翻译为{language}',
    'popup.translateAgain': '重新翻译为{language}',
    'popup.translatingTo': '正在翻译为{language}',
    'popup.providerNotConfigured': '尚未配置翻译服务',
    'popup.configureProvider': '配置翻译服务',
    'popup.clearTranslation': '清除译文',
    'popup.clearSiteCache': '清除此网站的缓存',
    'popup.settings': '设置',
    'popup.progress': '进度',
    'popup.failedBlocks': '失败段落',
    'popup.noReadableText': '此页面没有可翻译的正文',
    'popup.genericFailure': '无法翻译此页面，请检查设置后重试',
    'options.languages': '语言',
    'options.providers': '翻译服务',
    'options.storage': '存储',
    'options.advanced': '高级设置',
    'options.title': 'LingoFlow 设置',
    'options.subtitle': '管理阅读语言、翻译服务与本地存储。',
    'options.save': '保存设置',
    'options.saved': '设置已保存',
    'options.testConnection': '测试连接',
    'options.targetLanguage': '默认目标语言',
    'options.sourceLanguage': '默认源语言',
    'options.interfaceLanguage': '界面语言',
    'options.followBrowser': '跟随浏览器',
    'options.autoDetect': '自动检测',
    'options.defaultProvider': '默认翻译服务',
    'options.fallbackProvider': '备用翻译服务',
    'options.none': '无',
    'options.providerConfigured': '已配置',
    'options.providerIncomplete': '配置不完整',
    'options.azure': 'Azure Translator',
    'options.openAI': 'OpenAI-compatible',
    'options.region': '区域',
    'options.apiKey': 'API 密钥',
    'options.cacheEnabled': '启用本地翻译缓存',
    'options.clearAllCache': '清除全部缓存',
    'options.cacheCleared': '全部翻译缓存已清除',
    'options.renderMode': '译文显示方式',
    'options.belowOriginal': '显示在原文下方',
    'options.maxCacheItems': '最大缓存条目数',
    'options.azureEndpoint': 'Azure Endpoint',
    'options.openAIBaseUrl': 'OpenAI Base URL',
    'options.model': '模型',
  },
  en: {
    'popup.autoDetect': 'Auto-detect page language',
    'popup.ready': 'Ready to translate',
    'popup.translating': 'Translating',
    'popup.complete': 'Translation complete',
    'popup.partial': 'Some content could not be translated',
    'popup.failed': 'Translation failed',
    'popup.targetLanguage': 'Target language',
    'popup.translateTo': 'Translate to {language}',
    'popup.translateAgain': 'Translate again in {language}',
    'popup.translatingTo': 'Translating to {language}',
    'popup.providerNotConfigured': 'Translation service is not configured',
    'popup.configureProvider': 'Configure translation service',
    'popup.clearTranslation': 'Clear translation',
    'popup.clearSiteCache': "Clear this site's cache",
    'popup.settings': 'Settings',
    'popup.progress': 'Progress',
    'popup.failedBlocks': 'Failed blocks',
    'popup.noReadableText': 'No readable text found on this page',
    'popup.genericFailure': 'This page could not be translated. Check settings and try again.',
    'options.languages': 'Languages',
    'options.providers': 'Translation service',
    'options.storage': 'Storage',
    'options.advanced': 'Advanced',
    'options.title': 'LingoFlow Settings',
    'options.subtitle': 'Manage reading languages, translation service, and local storage.',
    'options.save': 'Save settings',
    'options.saved': 'Settings saved',
    'options.testConnection': 'Test connection',
    'options.targetLanguage': 'Target language',
    'options.sourceLanguage': 'Source language',
    'options.interfaceLanguage': 'Interface language',
    'options.followBrowser': 'Follow browser',
    'options.autoDetect': 'Auto-detect',
    'options.defaultProvider': 'Default provider',
    'options.fallbackProvider': 'Fallback provider',
    'options.none': 'None',
    'options.providerConfigured': 'Configured',
    'options.providerIncomplete': 'Configuration incomplete',
    'options.azure': 'Azure Translator',
    'options.openAI': 'OpenAI-compatible',
    'options.region': 'Region',
    'options.apiKey': 'API key',
    'options.cacheEnabled': 'Enable local translation cache',
    'options.clearAllCache': 'Clear all cache',
    'options.cacheCleared': 'All translation cache cleared',
    'options.renderMode': 'Render mode',
    'options.belowOriginal': 'Below original text',
    'options.maxCacheItems': 'Max cache items',
    'options.azureEndpoint': 'Azure endpoint',
    'options.openAIBaseUrl': 'OpenAI base URL',
    'options.model': 'Model',
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
