import { buildTranslationCacheKey, clearAllCache, clearCacheByDomain, pruneCache, resolveTranslationCache, safeSaveTranslationCache } from '@lingoflow/cache'
import { createDefaultProviderRegistry, testProviderConnection } from '@lingoflow/providers'
import { isFallbackEligible, retry, translateBatchWithDegrade } from '@lingoflow/scheduler'
import { getPublicRuntimeSettings, getSettings, getSettingsSummary, saveSettings } from '@lingoflow/settings'
import type {
  AppSettings,
  AzureTranslatorConfig,
  MessageResponse,
  OpenAICompatibleConfig,
  ProviderId,
  TranslationResult,
  TranslationTask,
} from '@lingoflow/types'
import { defineBackground } from 'wxt/utils/define-background'

const registry = createDefaultProviderRegistry()

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message, sender)
      .then(data => sendResponse(success(data)))
      .catch(error => sendResponse(failure(error)))

    return true
  })
})

async function handleMessage(message: { type?: string; payload?: unknown }, _sender: chrome.runtime.MessageSender): Promise<unknown> {
  switch (message?.type) {
    case 'settings/get':
      return getSettings()
    case 'settings/getRuntime': {
      const settings = await getSettings()
      return getPublicRuntimeSettings(settings)
    }
    case 'settings/getSummary':
      return getSettingsSummary(await getSettings())
    case 'settings/save':
      await saveSettings((message.payload as { settings: AppSettings }).settings)
      return { saved: true }
    case 'provider/testConnection': {
      const payload = message.payload as {
        providerId: ProviderId
        config: AzureTranslatorConfig | OpenAICompatibleConfig
      }
      return testProviderConnection(payload.providerId, payload.config)
    }
    case 'translation-cache/resolve':
      return resolveTranslationCache((message.payload as { tasks: TranslationTask[] }).tasks)
    case 'translation/translateBatch':
      return translateBatch((message.payload as { tasks: TranslationTask[] }).tasks)
    case 'cache/clearByDomain':
      await clearCacheByDomain((message.payload as { domain: string }).domain)
      return { cleared: true }
    case 'cache/clearAll':
      await clearAllCache()
      return { cleared: true }
    default:
      throw new Error(`Unsupported LingoFlow message: ${message?.type ?? 'unknown'}`)
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
  const primaryProviderId = tasks[0]?.providerId as ProviderId

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
  providerId: ProviderId,
): Promise<TranslationResult[]> {
  const provider = registry.get(providerId)
  const config = getProviderConfig(settings, providerId)
  const model = providerId === 'openai-compatible' ? settings.providers.openai.model : undefined
  const promptVersion = providerId === 'openai-compatible' ? 'prompt-v1' : undefined
  const output = await provider.translate(
    {
      sourceLang: tasks[0]?.sourceLang ?? 'auto',
      targetLang: tasks[0]?.targetLang ?? settings.targetLang,
      texts: tasks.map(task => task.sourceText),
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
      translatedText: output.texts[index],
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

function getProviderConfig(settings: AppSettings, providerId: ProviderId) {
  if (providerId === 'azure-translator') return settings.providers.azure
  return settings.providers.openai
}

function success<T>(data: T): MessageResponse<T> {
  return { ok: true, data }
}

function failure(error: unknown): MessageResponse<never> {
  return {
    ok: false,
    error: {
      message: error instanceof Error ? error.message : String(error),
    },
  }
}
