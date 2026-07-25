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
  | 'popup.toggleDarkMode'
  | 'popup.progress'
  | 'popup.failedBlocks'
  | 'popup.noReadableText'
  | 'popup.genericFailure'
  | 'popup.loading'
  | 'options.general'
  | 'options.providers'
  | 'options.localData'
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
  | 'options.readingLanguages'
  | 'options.readingLanguagesDescription'
  | 'options.interface'
  | 'options.interfaceDescription'
  | 'options.interfaceLanguage'
  | 'options.interfaceTheme'
  | 'options.themeSystem'
  | 'options.themeLight'
  | 'options.themeDark'
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
  | 'options.translationCache'
  | 'options.cacheDescription'
  | 'options.clearCacheDescription'
  | 'options.clearAllCache'
  | 'options.confirmClearAll'
  | 'options.cacheCleared'
  | 'options.maxCacheItems'
  | 'options.translationConcurrency'
  | 'options.performance'
  | 'options.performanceDescription'
  | 'options.hoverTranslation'
  | 'options.hoverTranslationDescription'
  | 'options.hoverTranslationShortcut'
  | 'options.manageShortcut'
  | 'options.shortcutUnassigned'
  | 'options.shortcutManagedByBrowser'
  | 'options.shortcutOpenFailed'
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
  | 'options.terminology'
  | 'options.siteRules'
  | 'options.settingsSections'
  | 'options.builtInBadge'
  | 'options.enable'
  | 'options.disable'
  | 'options.diagnosticsDescription'
  | 'options.diagnosticsFailed'
  | 'options.ruleIdRequired'
  | 'options.translationPosition'
  | 'options.activeGlossaries'
  | 'options.semanticsFingerprints'
  | 'options.builtInRules'
  | 'options.userRules'
  | 'options.noUserRules'
  | 'options.createUserRule'
  | 'options.editUserRule'
  | 'options.duplicateRule'
  | 'options.deleteRule'
  | 'options.ruleId'
  | 'options.ruleEnabled'
  | 'options.rulePriority'
  | 'options.ruleUrlMatches'
  | 'options.ruleUrlExcludes'
  | 'options.ruleSelectorMatches'
  | 'options.ruleContentRoots'
  | 'options.ruleExcludeSelectors'
  | 'options.ruleJson'
  | 'options.importRules'
  | 'options.exportRules'
  | 'options.testOnCurrentPage'
  | 'options.testingPage'
  | 'options.checkCompatibility'
  | 'options.checkingCompatibility'
  | 'options.compatibilityCompatible'
  | 'options.compatibilityWarning'
  | 'options.compatibilityIncompatible'
  | 'options.compatibilityUnchecked'
  | 'options.compatibilityChecked'
  | 'options.compatibilityAutoDisabled'
  | 'options.compatibilityCheckFailed'
  | 'options.compatibilityRecheckRequired'
  | 'options.ruleValidationFailed'
  | 'options.ruleSaved'
  | 'options.ruleDeleted'
  | 'options.rulesImported'
  | 'options.rulesExported'
  | 'options.importFailed'
  | 'options.noActiveTab'
  | 'options.diagnosticsReport'
  | 'options.matchedRule'
  | 'options.rootsSelected'
  | 'options.candidatesCollected'
  | 'options.candidatesSkipped'
  | 'options.topSkipReasons'
  | 'options.selectedRoots'
  | 'options.rejectedRoots'
  | 'popup.viewDetails'

const COPY: Record<UiLocale, Record<UiCopyKey, string>> = {
  'zh-Hans': {
    'popup.autoDetect': '自动检测',
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
    'popup.toggleDarkMode': '切换深色模式',
    'popup.progress': '进度',
    'popup.failedBlocks': '失败段落',
    'popup.noReadableText': '此页面没有可翻译的正文',
    'popup.genericFailure': '无法翻译此页面，请检查设置后重试',
    'popup.loading': '正在加载…',
    'options.general': '通用',
    'options.providers': '翻译服务',
    'options.localData': '本地数据',
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
    'options.readingLanguages': '阅读语言',
    'options.readingLanguagesDescription': '设置网页原文的识别方式，以及默认翻译到哪种语言。',
    'options.interface': '界面',
    'options.interfaceDescription': '控制 LingoFlow 自身使用的语言与明暗外观。',
    'options.interfaceLanguage': '界面语言',
    'options.interfaceTheme': '界面主题',
    'options.themeSystem': '跟随系统',
    'options.themeLight': '浅色',
    'options.themeDark': '深色',
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
    'options.translationCache': '翻译缓存',
    'options.cacheDescription': '译文缓存在当前浏览器中，用于减少重复请求；不会同步到云端。',
    'options.clearCacheDescription': '删除所有网站的本地译文缓存。此操作不会删除翻译服务或站点规则。',
    'options.clearAllCache': '清除全部缓存',
    'options.confirmClearAll': '确认清除全部缓存',
    'options.cacheCleared': '全部翻译缓存已清除',
    'options.maxCacheItems': '最大缓存条目数',
    'options.translationConcurrency': '并发翻译批次数',
    'options.performance': '请求并发',
    'options.performanceDescription': '同时发送更多批次可以加快长页面翻译，但可能更容易触发服务限流。',
    'options.hoverTranslation': '鼠标句段翻译',
    'options.hoverTranslationDescription': '将鼠标指向文字并按快捷键，只翻译当前句段，译文会插入原文块下方。选中文字时会优先翻译选区。',
    'options.hoverTranslationShortcut': '当前快捷键',
    'options.manageShortcut': '在浏览器中修改',
    'options.shortcutUnassigned': '未分配',
    'options.shortcutManagedByBrowser': '快捷键由浏览器管理，修改后立即生效，不需要保存本页设置。',
    'options.shortcutOpenFailed': '无法打开浏览器快捷键页面，请手动访问 chrome://extensions/shortcuts。',
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
    'options.terminology': '术语管理',
    'options.siteRules': '站点规则',
    'options.settingsSections': '设置分区',
    'options.builtInBadge': '内置',
    'options.enable': '启用',
    'options.disable': '停用',
    'options.diagnosticsDescription': '在当前页面运行只读诊断，不调用任何翻译服务。',
    'options.diagnosticsFailed': '页面诊断失败',
    'options.ruleIdRequired': '规则 ID 不能为空',
    'options.translationPosition': '译文位置',
    'options.activeGlossaries': '生效术语表',
    'options.semanticsFingerprints': '术语语义指纹',
    'options.builtInRules': '内置规则',
    'options.userRules': '自定义规则',
    'options.noUserRules': '暂无自定义规则。您可以为特定网站创建规则来优化翻译行为。',
    'options.createUserRule': '创建规则',
    'options.editUserRule': '编辑规则',
    'options.duplicateRule': '复制',
    'options.deleteRule': '删除',
    'options.ruleId': '规则 ID',
    'options.ruleEnabled': '启用',
    'options.rulePriority': '优先级',
    'options.ruleUrlMatches': 'URL 匹配（每行一个）',
    'options.ruleUrlExcludes': 'URL 排除（每行一个）',
    'options.ruleSelectorMatches': '选择器匹配（每行一个）',
    'options.ruleContentRoots': '内容根选择器（每行一个）',
    'options.ruleExcludeSelectors': '排除选择器（每行一个）',
    'options.ruleJson': '高级 JSON',
    'options.importRules': '导入规则',
    'options.exportRules': '导出规则',
    'options.testOnCurrentPage': '在当前页面测试',
    'options.testingPage': '正在测试…',
    'options.checkCompatibility': '复检兼容性',
    'options.checkingCompatibility': '正在复检…',
    'options.compatibilityCompatible': '兼容',
    'options.compatibilityWarning': '需关注',
    'options.compatibilityIncompatible': '不兼容',
    'options.compatibilityUnchecked': '尚未验证',
    'options.compatibilityChecked': '上次检查：{date}',
    'options.compatibilityAutoDisabled': '规则已复检；检测到不兼容并已自动停用。',
    'options.compatibilityCheckFailed': '规则兼容性复检失败',
    'options.compatibilityRecheckRequired': '该规则已判定为不兼容，请先在目标页面复检后再启用。',
    'options.ruleValidationFailed': '规则验证失败',
    'options.ruleSaved': '规则已保存',
    'options.ruleDeleted': '规则已删除',
    'options.rulesImported': '规则已导入',
    'options.rulesExported': '规则已导出',
    'options.importFailed': '导入失败',
    'options.noActiveTab': '无法访问当前页面。请打开一个网页后重试。',
    'options.diagnosticsReport': '诊断报告',
    'options.matchedRule': '匹配规则',
    'options.rootsSelected': '内容根',
    'options.candidatesCollected': '已收集',
    'options.candidatesSkipped': '已跳过',
    'options.topSkipReasons': '主要跳过原因',
    'options.selectedRoots': '已选内容根',
    'options.rejectedRoots': '已拒绝内容根',
    'popup.viewDetails': '查看详情',
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
    'popup.toggleDarkMode': 'Toggle dark mode',
    'popup.progress': 'Progress',
    'popup.failedBlocks': 'Failed blocks',
    'popup.noReadableText': 'No readable text found on this page',
    'popup.genericFailure': 'This page could not be translated. Check settings and try again.',
    'popup.loading': 'Loading...',
    'options.general': 'General',
    'options.providers': 'Translation service',
    'options.localData': 'Local data',
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
    'options.readingLanguages': 'Reading languages',
    'options.readingLanguagesDescription': 'Choose how page text is detected and which language translations use by default.',
    'options.interface': 'Interface',
    'options.interfaceDescription': 'Choose the language and appearance used by LingoFlow itself.',
    'options.interfaceLanguage': 'Interface language',
    'options.interfaceTheme': 'Interface theme',
    'options.themeSystem': 'Follow system',
    'options.themeLight': 'Light',
    'options.themeDark': 'Dark',
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
    'options.translationCache': 'Translation cache',
    'options.cacheDescription': 'Translations stay in this browser to reduce repeat requests. They are never synced to the cloud.',
    'options.clearCacheDescription': 'Delete cached translations for every site. Translation services and site rules are not affected.',
    'options.clearAllCache': 'Clear all cache',
    'options.confirmClearAll': 'Confirm clear all cache',
    'options.cacheCleared': 'All translation cache cleared',
    'options.maxCacheItems': 'Max cache items',
    'options.translationConcurrency': 'Concurrent translation batches',
    'options.performance': 'Request concurrency',
    'options.performanceDescription': 'More parallel batches can translate long pages faster, but may hit provider rate limits sooner.',
    'options.hoverTranslation': 'Pointer sentence translation',
    'options.hoverTranslationDescription': 'Point to text and press the shortcut to translate only that sentence below its source block. Selected text takes priority.',
    'options.hoverTranslationShortcut': 'Current shortcut',
    'options.manageShortcut': 'Change in browser',
    'options.shortcutUnassigned': 'Not assigned',
    'options.shortcutManagedByBrowser': 'The browser owns this shortcut. Changes apply immediately and do not require saving this page.',
    'options.shortcutOpenFailed': 'Could not open browser shortcut settings. Visit chrome://extensions/shortcuts manually.',
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
    'options.terminology': 'Terminology',
    'options.siteRules': 'Site rules',
    'options.settingsSections': 'Settings sections',
    'options.builtInBadge': 'built-in',
    'options.enable': 'Enable',
    'options.disable': 'Disable',
    'options.diagnosticsDescription': 'Run read-only diagnostics on the active page without calling a translation provider.',
    'options.diagnosticsFailed': 'Page diagnostics failed',
    'options.ruleIdRequired': 'Rule ID is required',
    'options.translationPosition': 'Translation position',
    'options.activeGlossaries': 'Active glossaries',
    'options.semanticsFingerprints': 'Terminology fingerprints',
    'options.builtInRules': 'Built-in rules',
    'options.userRules': 'Custom rules',
    'options.noUserRules': 'No custom rules yet. Create rules to optimize translation behavior for specific websites.',
    'options.createUserRule': 'Create rule',
    'options.editUserRule': 'Edit rule',
    'options.duplicateRule': 'Duplicate',
    'options.deleteRule': 'Delete',
    'options.ruleId': 'Rule ID',
    'options.ruleEnabled': 'Enabled',
    'options.rulePriority': 'Priority',
    'options.ruleUrlMatches': 'URL matches (one per line)',
    'options.ruleUrlExcludes': 'URL excludes (one per line)',
    'options.ruleSelectorMatches': 'Selector matches (one per line)',
    'options.ruleContentRoots': 'Content root selectors (one per line)',
    'options.ruleExcludeSelectors': 'Exclude selectors (one per line)',
    'options.ruleJson': 'Advanced JSON',
    'options.importRules': 'Import rules',
    'options.exportRules': 'Export rules',
    'options.testOnCurrentPage': 'Test on current page',
    'options.testingPage': 'Testing…',
    'options.checkCompatibility': 'Check compatibility',
    'options.checkingCompatibility': 'Checking…',
    'options.compatibilityCompatible': 'compatible',
    'options.compatibilityWarning': 'warning',
    'options.compatibilityIncompatible': 'incompatible',
    'options.compatibilityUnchecked': 'not checked',
    'options.compatibilityChecked': 'Last checked: {date}',
    'options.compatibilityAutoDisabled': 'Compatibility checked; the incompatible rule was disabled automatically.',
    'options.compatibilityCheckFailed': 'Rule compatibility check failed',
    'options.compatibilityRecheckRequired': 'This rule is incompatible. Check it again on the target page before enabling it.',
    'options.ruleValidationFailed': 'Rule validation failed',
    'options.ruleSaved': 'Rule saved',
    'options.ruleDeleted': 'Rule deleted',
    'options.rulesImported': 'Rules imported',
    'options.rulesExported': 'Rules exported',
    'options.importFailed': 'Import failed',
    'options.noActiveTab': 'Cannot access the current page. Open a web page and try again.',
    'options.diagnosticsReport': 'Diagnostics report',
    'options.matchedRule': 'Matched rule',
    'options.rootsSelected': 'Roots selected',
    'options.candidatesCollected': 'Collected',
    'options.candidatesSkipped': 'Skipped',
    'options.topSkipReasons': 'Top skip reasons',
    'options.selectedRoots': 'Selected roots',
    'options.rejectedRoots': 'Rejected roots',
    'popup.viewDetails': 'View details',
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
