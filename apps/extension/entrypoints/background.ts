import { buildTranslationCacheKey, clearAllCache, clearCacheByDomain, pruneCache, resolveTranslationCache, safeSaveTranslationCache } from '@lingoflow/cache'
import { createDefaultProviderRegistry, extractBuiltInProviderConfig, testProviderConnection } from '@lingoflow/providers'
import { isFallbackEligible, retry, translateBatchWithDegrade } from '@lingoflow/scheduler'
import { getPublicRuntimeSettings, getSettings, getSettingsSummary, saveSettings } from '@lingoflow/settings'
import { failure, restoreInlineTokens, success } from '@lingoflow/shared'
import { namespaceUserRuleId, validateUserRule, SITE_RULES } from '@lingoflow/rules'
import type {
  AppSettings,
  LingoFlowMessage,
  TranslationResult,
  TranslationTask,
  UserRulesExportDocument,
  UserSiteRule,
} from '@lingoflow/types'
import { defineBackground } from 'wxt/utils/define-background'

const KNOWN_MESSAGE_TYPES = new Set<string>([
  'settings/get',
  'settings/getRuntime',
  'settings/getSummary',
  'settings/save',
  'settings/saveTheme',
  'provider/testConnection',
  'translation-cache/resolve',
  'translation/translateBatch',
  'cache/clearByDomain',
  'cache/clearAll',
  'userRules/get',
  'userRules/save',
  'userRules/validate',
  'userRules/import',
  'userRules/export',
])

const registry = createDefaultProviderRegistry()

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message?.type || !KNOWN_MESSAGE_TYPES.has(message.type)) {
      return false
    }

    handleMessage(message as LingoFlowMessage, sender)
      .then(data => sendResponse(success(data)))
      .catch(error => sendResponse(failure(error)))

    return true
  })
})

async function handleMessage(message: LingoFlowMessage, _sender: chrome.runtime.MessageSender): Promise<unknown> {
  switch (message.type) {
    case 'settings/get':
      return getSettings()
    case 'settings/getRuntime': {
      const settings = await getSettings()
      return getPublicRuntimeSettings(settings)
    }
    case 'settings/getSummary':
      return getSettingsSummary(await getSettings())
    case 'settings/save':
      await saveSettingsPreservingUserRules(message.payload.settings)
      return { saved: true }
    case 'settings/saveTheme': {
      const current = await getSettings()
      current.uiTheme = message.payload.theme
      await saveSettings(current)
      return { saved: true }
    }
    case 'provider/testConnection':
      return testProviderConnection(message.payload.config)
    case 'translation-cache/resolve':
      return resolveTranslationCache(message.payload.tasks)
    case 'translation/translateBatch':
      return translateBatch(message.payload.tasks)
    case 'cache/clearByDomain':
      await clearCacheByDomain(message.payload.domain)
      return { cleared: true }
    case 'cache/clearAll':
      await clearAllCache()
      await clearAllPageMemoryCaches()
      return { cleared: true }
    case 'userRules/get':
      return getUserRules()
    case 'userRules/save':
      return saveUserRules(message.payload.rules)
    case 'userRules/validate':
      return validateUserRuleMessage(message.payload.rule, message.payload.existingRuleId)
    case 'userRules/import':
      return importUserRules(message.payload.document, message.payload.mode)
    case 'userRules/export':
      return exportUserRules()
    case 'page/progressUpdate':
      return { received: true }
    case 'page/translate':
    case 'page/clear':
    case 'page/clearCache':
    case 'page/status':
    case 'page/enableDynamicTranslation':
    case 'page/disableDynamicTranslation':
    case 'page/getDiagnostics':
    case 'page/diagnose':
    case 'page/setDynamicTranslation':
    case 'page/setDisplayMode':
      return { delegated: true }
    default: {
      const _exhaustive: never = message
      throw new Error(`Unsupported LingoFlow message: ${(message as { type?: string }).type ?? 'unknown'}`)
    }
  }
}

async function translateBatch(tasks: TranslationTask[]) {
  const settings = await getSettings()
  const results = await translateBatchWithDegrade(tasks, batch => translateBatchWithProviders(batch, settings))

  if (settings.cacheEnabled) {
    await pruneCache(settings.maxCacheItems)
  }

  return { results }
}

async function translateBatchWithProviders(tasks: TranslationTask[], settings: AppSettings): Promise<TranslationResult[]> {
  if (tasks.length === 0) return []
  const primaryProviderId = tasks[0].providerId

  try {
    return await retry(() => translateWithProvider(tasks, settings, primaryProviderId), {
      attempts: 3,
      delayMs: 350,
    })
  } catch (error) {
    const fallbackProviderId = settings.fallbackProviderId || undefined
    if (!fallbackProviderId || fallbackProviderId === primaryProviderId || !isFallbackEligible(error)) {
      throw error
    }

    return retry(() => translateWithProvider(tasks, settings, fallbackProviderId), {
      attempts: 2,
      delayMs: 350,
    })
  }
}

async function translateWithProvider(
  tasks: TranslationTask[],
  settings: AppSettings,
  providerId: string,
): Promise<TranslationResult[]> {
  const providerConfig = getProviderConfigForProvider(settings, providerId)
  if (!providerConfig) throw new Error("Provider config not found: " + providerId)
  const presetId = providerConfig.presetId ?? providerId
  const provider = registry.get(presetId)
  const config = extractBuiltInProviderConfig(providerConfig)
  const model = providerConfig.values.model || undefined
  const promptVersion = presetId === "openai-compatible" ? "prompt-v1" : undefined
  const output = await provider.translate(
    {
      sourceLang: tasks[0]?.sourceLang ?? 'auto',
      targetLang: tasks[0]?.targetLang ?? settings.targetLang,
      texts: tasks.map(task => task.requestText ?? task.sourceText),
      context: {
        pageUrl: tasks[0]?.pageUrl,
        domain: tasks[0]?.domain,
      },
    },
    config,
  )

  if (output.texts.length !== tasks.length) {
    throw new Error('Provider returned a different number of translations')
  }

  const results: TranslationResult[] = tasks.map((task, index) => {
    const cacheKey =
      providerId === task.providerId
        ? task.cacheKey
        : buildTranslationCacheKey({
            textHash: task.textHash,
            sourceLang: task.sourceLang,
            targetLang: task.targetLang,
            providerId,
            model,
            promptVersion,
            normalizeVersion: task.normalizeVersion ?? 'v1',
          })

    return {
      taskId: task.id,
      blockId: task.blockId,
      sourceText: task.sourceText,
      translatedText: restoreInlineTokens(output.texts[index], task.inlineTokens),
      insertion: task.insertion,
      sourceLang: task.sourceLang,
      targetLang: task.targetLang,
      providerId,
      model,
      promptVersion,
      cacheKey,
      fromCache: false,
      status: 'success',
      meta: task.meta,
    }
  })

  if (settings.cacheEnabled) {
    await Promise.all(
      results.map((result, index) =>
        result.status === 'success'
          ? safeSaveTranslationCache({
              task: {
                ...tasks[index],
                providerId,
                model,
                promptVersion,
                cacheKey: result.cacheKey,
              },
              translatedText: result.translatedText,
            })
          : undefined,
      ),
    )
  }

  return results
}

function getProviderConfigForProvider(settings: AppSettings, providerId: string) {
  return settings.providers[providerId]
}

async function clearAllPageMemoryCaches() {
  const tabs = await chrome.tabs.query({})
  const messages = tabs.flatMap(tab =>
    tab.id === undefined
      ? []
      : [chrome.tabs.sendMessage(tab.id, { type: 'page/clearCache' })],
  )
  await Promise.allSettled(messages)
}

function getBuiltinIds(): Set<string> {
  return new Set(SITE_RULES.map(r => r.id))
}

async function getUserRules(): Promise<UserSiteRule[]> {
  const settings = await getSettings()
  return settings.userRules ?? []
}

async function saveSettingsPreservingUserRules(settings: AppSettings): Promise<void> {
  const current = await getSettings()
  await saveSettings({ ...settings, userRules: current.userRules })
}

async function saveUserRules(rules: UserSiteRule[]): Promise<{ saved: boolean; rules: UserSiteRule[] }> {
  const settings = await getSettings()
  const validatedRules = validateUserRuleList(rules)
  settings.userRules = validatedRules
  await saveSettings(settings)
  return { saved: true, rules: validatedRules }
}

async function validateUserRuleMessage(rule: UserSiteRule, existingRuleId?: string) {
  const builtinIds = getBuiltinIds()
  const settings = await getSettings()
  const normalizedExistingRuleId = existingRuleId
    ? namespaceUserRuleId(existingRuleId, builtinIds)
    : undefined
  const existingRules = settings.userRules.filter(existing => existing.id !== normalizedExistingRuleId)
  const normalizedRule = {
    ...rule,
    id: namespaceUserRuleId(rule.id, builtinIds),
    source: 'user' as const,
  }
  return validateUserRule(normalizedRule, existingRules, builtinIds)
}

function validateUserRuleList(rules: UserSiteRule[]): UserSiteRule[] {
  const builtinIds = getBuiltinIds()
  const validatedRules: UserSiteRule[] = []

  for (const rule of rules) {
    const normalizedRule: UserSiteRule = {
      ...rule,
      id: namespaceUserRuleId(rule.id, builtinIds),
      source: 'user',
    }
    const validation = validateUserRule(normalizedRule, validatedRules, builtinIds)
    if (!validation.ok) {
      const details = validation.errors.map(error => `${error.field}: ${error.message}`).join('; ')
      throw new Error(`Invalid user rule "${normalizedRule.id}": ${details}`)
    }
    validatedRules.push(normalizedRule)
  }

  return validatedRules
}

async function importUserRules(
  document: UserRulesExportDocument,
  mode: 'add' | 'replace' | 'skip-duplicates',
): Promise<{ imported: number; skipped: number }> {
  if (document.schema !== 'lingoflow.userRules.v1') {
    throw new Error('Invalid import document schema.')
  }

  const builtinIds = getBuiltinIds()
  const settings = await getSettings()
  const existing = settings.userRules ?? []
  const existingIds = new Set(existing.map(r => r.id))
  let imported = 0
  let skipped = 0

  const newRules: UserSiteRule[] = mode === 'replace' ? [] : [...existing]

  for (const rule of document.rules) {
    const namespaced = namespaceUserRuleId(rule.id, builtinIds)
    const validation = validateUserRule({ ...rule, id: namespaced }, newRules, builtinIds)
    if (!validation.ok) {
      skipped++
      continue
    }

    if (mode === 'skip-duplicates' && existingIds.has(namespaced)) {
      skipped++
      continue
    }

    const idx = newRules.findIndex(r => r.id === namespaced)
    const now = new Date().toISOString()
    const entry: UserSiteRule = {
      ...rule,
      id: namespaced,
      source: 'user',
      enabled: rule.enabled ?? true,
      createdAt: rule.createdAt ?? now,
      updatedAt: now,
    }

    if (idx >= 0) {
      newRules[idx] = entry
    } else {
      newRules.push(entry)
    }
    imported++
  }

  settings.userRules = newRules
  await saveSettings(settings)
  return { imported, skipped }
}

function exportUserRules(): Promise<UserRulesExportDocument> {
  return getSettings().then(settings => ({
    schema: 'lingoflow.userRules.v1' as const,
    exportedAt: new Date().toISOString(),
    rules: settings.userRules ?? [],
  }))
}
