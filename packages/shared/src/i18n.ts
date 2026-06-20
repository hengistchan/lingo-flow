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
  | 'popup.siteCacheCleared'
  | 'popup.siteCacheFailed'
  | 'popup.settings'
  | 'popup.progress'
  | 'popup.failedBlocks'
  | 'popup.noReadableText'
  | 'popup.genericFailure'
  | 'popup.loading'
  | 'options.languages'
  | 'options.providers'
  | 'options.storage'
  | 'options.advanced'
  | 'options.title'
  | 'options.subtitle'
  | 'options.save'
  | 'options.saved'
  | 'options.testConnection'
  | 'options.connectionTestDescription'
  | 'options.testingConnection'
  | 'options.connectionOk'
  | 'options.connectionConfigIncomplete'
  | 'options.connectionAuthenticationFailed'
  | 'options.connectionNetworkFailed'
  | 'options.connectionPermissionDenied'
  | 'options.connectionProviderFailed'
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
  | 'options.confirmClearAll'
  | 'options.cacheCleared'
  | 'options.renderMode'
  | 'options.belowOriginal'
  | 'options.maxCacheItems'
  | 'options.translationConcurrency'
  | 'options.reasoningEffort'
  | 'options.reasoningAuto'
  | 'options.reasoningNone'
  | 'options.reasoningMinimal'
  | 'options.reasoningLow'
  | 'options.reasoningMedium'
  | 'options.reasoningHigh'
  | 'options.disableThinking'
  | 'options.azureEndpoint'
  | 'options.openAIBaseUrl'
  | 'options.model'
  | 'options.invalidEndpoint'
  | 'options.removeProvider'
  | 'options.addProvider'
  | 'options.customOpenAI'
  | 'options.customProviderName'
  | 'options.cancel'

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
    'popup.siteCacheCleared': '已清除此网站的翻译缓存',
    'popup.siteCacheFailed': '无法清除此网站的缓存',
    'popup.settings': '设置',
    'popup.progress': '进度',
    'popup.failedBlocks': '失败段落',
    'popup.noReadableText': '此页面没有可翻译的正文',
    'popup.genericFailure': '无法翻译此页面，请检查设置后重试',
    'popup.loading': '正在加载…',
    'options.languages': '语言',
    'options.providers': '翻译服务',
    'options.storage': '存储',
    'options.advanced': '高级设置',
    'options.title': 'LingoFlow 设置',
    'options.subtitle': '管理阅读语言、翻译服务与本地存储。',
    'options.save': '保存设置',
    'options.saved': '设置已保存',
    'options.testConnection': '测试连接',
    'options.connectionTestDescription': '测试时会向所选翻译服务发送一个简短样本。',
    'options.testingConnection': '正在测试连接',
    'options.connectionOk': '连接成功',
    'options.connectionConfigIncomplete': '请先补全所选翻译服务的配置。',
    'options.connectionAuthenticationFailed': '身份验证失败，请检查 API 密钥和区域。',
    'options.connectionNetworkFailed': '无法连接到翻译服务，请检查网络与 Endpoint。',
    'options.connectionPermissionDenied': '需要允许访问此翻译服务地址才能继续。',
    'options.connectionProviderFailed': '翻译服务返回异常，请稍后重试。',
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
    'options.confirmClearAll': '确认清除全部缓存',
    'options.cacheCleared': '全部翻译缓存已清除',
    'options.renderMode': '译文显示方式',
    'options.belowOriginal': '显示在原文下方',
    'options.maxCacheItems': '最大缓存条目数',
    'options.translationConcurrency': '并发翻译批次数',
    'options.reasoningEffort': '推理强度',
    'options.reasoningAuto': '自动',
    'options.reasoningNone': '关闭',
    'options.reasoningMinimal': '最小',
    'options.reasoningLow': '低',
    'options.reasoningMedium': '中',
    'options.reasoningHigh': '高',
    'options.disableThinking': '禁用 Thinking',
    'options.azureEndpoint': 'Azure Endpoint',
    'options.openAIBaseUrl': 'OpenAI Base URL',
    'options.model': '模型',
    'options.invalidEndpoint': '请输入有效的 URL',
    'options.removeProvider': '移除此翻译服务',
    'options.addProvider': '添加翻译服务',
    'options.customOpenAI': '自定义 OpenAI 兼容',
    'options.customProviderName': '名称',
    'options.cancel': '取消',
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
    'popup.siteCacheCleared': "This site's translation cache was cleared",
    'popup.siteCacheFailed': "This site's cache could not be cleared",
    'popup.settings': 'Settings',
    'popup.progress': 'Progress',
    'popup.failedBlocks': 'Failed blocks',
    'popup.noReadableText': 'No readable text found on this page',
    'popup.genericFailure': 'This page could not be translated. Check settings and try again.',
    'popup.loading': 'Loading...',
    'options.languages': 'Languages',
    'options.providers': 'Translation service',
    'options.storage': 'Storage',
    'options.advanced': 'Advanced',
    'options.title': 'LingoFlow Settings',
    'options.subtitle': 'Manage reading languages, translation service, and local storage.',
    'options.save': 'Save settings',
    'options.saved': 'Settings saved',
    'options.testConnection': 'Test connection',
    'options.connectionTestDescription': 'Testing sends one short sample to the selected provider.',
    'options.testingConnection': 'Testing connection',
    'options.connectionOk': 'Connection successful',
    'options.connectionConfigIncomplete': 'Complete the selected provider configuration before testing.',
    'options.connectionAuthenticationFailed': 'Authentication failed. Check the API key and region.',
    'options.connectionNetworkFailed': 'Could not reach the provider. Check the network and endpoint.',
    'options.connectionPermissionDenied': 'Allow access to this provider address to continue.',
    'options.connectionProviderFailed': 'The provider returned an unexpected response. Try again.',
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
    'options.confirmClearAll': 'Confirm clear all cache',
    'options.cacheCleared': 'All translation cache cleared',
    'options.renderMode': 'Render mode',
    'options.belowOriginal': 'Below original text',
    'options.maxCacheItems': 'Max cache items',
    'options.translationConcurrency': 'Concurrent translation batches',
    'options.reasoningEffort': 'Reasoning effort',
    'options.reasoningAuto': 'Auto',
    'options.reasoningNone': 'None',
    'options.reasoningMinimal': 'Minimal',
    'options.reasoningLow': 'Low',
    'options.reasoningMedium': 'Medium',
    'options.reasoningHigh': 'High',
    'options.disableThinking': 'Disable thinking',
    'options.azureEndpoint': 'Azure endpoint',
    'options.openAIBaseUrl': 'OpenAI base URL',
    'options.model': 'Model',
    'options.invalidEndpoint': 'Please enter a valid URL',
    'options.removeProvider': 'Remove provider',
    'options.addProvider': 'Add provider',
    'options.customOpenAI': 'Custom OpenAI-compatible',
    'options.customProviderName': 'Name',
    'options.cancel': 'Cancel',
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
