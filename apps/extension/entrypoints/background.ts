import { buildTranslationCacheKey, clearAllCache, clearCacheByDomain, pruneCache, resolveTranslationCache, safeSaveTranslationCache } from '@lingoflow/cache'
import { createDefaultProviderRegistry, extractAzureConfig, extractOpenAIConfig, testProviderConnection } from '@lingoflow/providers'
import { isFallbackEligible, retry, translateBatchWithDegrade } from '@lingoflow/scheduler'
import { getPublicRuntimeSettings, getSettings, getSettingsSummary, saveSettings } from '@lingoflow/settings'
import { failure, restoreInlineTokens, success } from '@lingoflow/shared'
import type {
  AppSettings,
  LingoFlowMessage,
  TranslationResult,
  TranslationTask,
} from '@lingoflow/types'
import { defineBackground } from 'wxt/utils/define-background'

const KNOWN_MESSAGE_TYPES = new Set<string>([
  'settings/get',
  'settings/getRuntime',
  'settings/getSummary',
  'settings/save',
  'provider/testConnection',
  'translation-cache/resolve',
  'translation/translateBatch',
  'cache/clearByDomain',
  'cache/clearAll',
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
      await saveSettings(message.payload.settings)
      return { saved: true }
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
    case 'page/progressUpdate':
      return { received: true }
    case 'page/translate':
    case 'page/clear':
    case 'page/clearCache':
    case 'page/status':
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
  const config = presetId === "azure-translator"
    ? extractAzureConfig(providerConfig)
    : extractOpenAIConfig(providerConfig)
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
      sourceLang: task.sourceLang,
      targetLang: task.targetLang,
      providerId,
      model,
      promptVersion,
      cacheKey,
      fromCache: false,
      status: 'success',
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
