import { buildTranslationCacheKey } from '@lingoflow/cache'
import { collectTextBlocks } from '@lingoflow/dom'
import { clearTranslations, safeRender } from '@lingoflow/renderer'
import { createBatches } from '@lingoflow/scheduler'
import { getDomain, getSourceLanguageOptions, getTargetLanguageOptions, success, failure } from '@lingoflow/shared'
import type {
  MessageResponse,
  PageTranslationProgress,
  PublicRuntimeSettings,
  TranslationResult,
  TranslationTask,
} from '@lingoflow/types'

const MAX_MEMORY_CACHE_ENTRIES = 500
const DEFAULT_MAX_BATCH_ITEMS = 20
const DEFAULT_MAX_BATCH_CHARS = 12000

type RuntimeDependencies = {
  document?: Document
  chromeRuntime?: typeof chrome.runtime
}

type PageTranslationOverrides = {
  sourceLang?: 'auto' | string
  targetLang?: string
}

export function evictOldestCacheEntries(cache: Map<string, TranslationResult>, maxEntries: number) {
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value
    if (oldestKey !== undefined) cache.delete(oldestKey)
  }
}

export function createContentRuntime(dependencies: RuntimeDependencies = {}) {
  const root = dependencies.document ?? document
  const runtime = dependencies.chromeRuntime ?? chrome.runtime
  const memoryCache = new Map<string, TranslationResult>()
  let progress: PageTranslationProgress = idleProgress()
  let translating = false

  async function translatePage(overrides: PageTranslationOverrides = {}) {
    if (translating) return progress
    translating = true

    progress = {
      status: 'translating',
      sourceLang: overrides.sourceLang ?? progress.sourceLang,
      targetLang: overrides.targetLang ?? progress.targetLang,
      totalBlocks: 0,
      translatedBlocks: 0,
      cacheHits: 0,
      failedBlocks: 0,
    }

    try {
      clearTranslations(root)
      const settings = await sendRuntimeMessage<PublicRuntimeSettings>(runtime, { type: 'settings/getRuntime' })
      const sourceLang = resolveLanguage(overrides.sourceLang, settings.sourceLang, getSourceLanguageOptions())
      const targetLang = resolveLanguage(overrides.targetLang, settings.targetLang, getTargetLanguageOptions())
      const effectiveSettings = {
        ...settings,
        sourceLang,
        targetLang,
      }
      progress.sourceLang = sourceLang
      progress.targetLang = targetLang
      const pageUrl = root.location.href
      const domain = getDomain(pageUrl)
      const blocks = await collectTextBlocks(root, {
        sourceLang,
        targetLang,
        pageUrl,
        domain,
      })
      const tasks = blocks.map(block => createTask(block, effectiveSettings, pageUrl, domain))
      progress.totalBlocks = tasks.length

      if (tasks.length === 0) {
        progress.status = 'failed'
        progress.messageCode = 'no_readable_text'
        progress.message = 'No readable text blocks found.'
        return progress
      }

      const { hits: memoryHits, misses: memoryMisses } = resolveMemoryCache(tasks)
      renderResults(memoryHits)
      progress.cacheHits += memoryHits.length
      progress.translatedBlocks += memoryHits.length

      let misses = memoryMisses
      if (settings.cacheEnabled && misses.length > 0) {
        try {
          const cache = await sendRuntimeMessage<{
            hits: TranslationResult[]
            misses: TranslationTask[]
          }>(runtime, {
            type: 'translation-cache/resolve',
            payload: { tasks: misses },
          })

          renderResults(cache.hits)
          for (const hit of cache.hits) memoryCache.set(hit.cacheKey, hit)
          evictOldestCacheEntries(memoryCache, MAX_MEMORY_CACHE_ENTRIES)
          progress.cacheHits += cache.hits.length
          progress.translatedBlocks += cache.hits.length
          misses = cache.misses
        } catch (error) {
          console.warn('[LingoFlow] Cache resolve degraded to misses', error)
        }
      }

      for (const batch of createBatches(misses, { maxItems: DEFAULT_MAX_BATCH_ITEMS, maxChars: DEFAULT_MAX_BATCH_CHARS })) {
        try {
          const response = await sendRuntimeMessage<{ results: TranslationResult[] }>(runtime, {
            type: 'translation/translateBatch',
            payload: { tasks: batch },
          })

          renderResults(response.results)
          for (const result of response.results) {
            if (result.status === 'success') {
              memoryCache.set(result.cacheKey, result)
              evictOldestCacheEntries(memoryCache, MAX_MEMORY_CACHE_ENTRIES)
              progress.translatedBlocks += 1
            } else {
              progress.failedBlocks += 1
            }
          }
        } catch (error) {
          for (const task of batch) {
            progress.failedBlocks += 1
          }
          console.warn('[LingoFlow] Batch translation failed', error)
        }

        runtime.sendMessage({
          type: 'page/progressUpdate',
          payload: { ...progress },
        }).catch(() => {})
      }

      progress.status = deriveProgressStatus({
        translated: progress.translatedBlocks,
        failed: progress.failedBlocks,
        total: progress.totalBlocks,
      })
      return progress
    } catch (error) {
      progress.status = 'failed'
      progress.messageCode = 'runtime_error'
      progress.message = error instanceof Error ? error.message : String(error)
      return progress
    } finally {
      translating = false
    }
  }

  function start() {
    runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === 'page/status') {
        sendResponse(success(progress))
        return false
      }

      if (message?.type === 'page/clear') {
        clearTranslations(root)
        memoryCache.clear()
        progress = idleProgress()
        sendResponse(success(progress))
        return false
      }

      if (message?.type === 'page/clearCache') {
        memoryCache.clear()
        sendResponse(success({ cleared: true }))
        return false
      }

      if (message?.type === 'page/translate') {
        translatePage((message.payload ?? {}) as PageTranslationOverrides)
          .then(result => sendResponse(success(result)))
          .catch(error => sendResponse(failure(error)))
        return true
      }

      return false
    })
  }

  function resolveMemoryCache(tasks: TranslationTask[]) {
    const hits: TranslationResult[] = []
    const misses: TranslationTask[] = []

    for (const task of tasks) {
      const cached = memoryCache.get(task.cacheKey)
      if (cached?.status === 'success') {
        hits.push({
          ...cached,
          taskId: task.id,
          blockId: task.blockId,
          sourceText: task.sourceText,
          fromCache: true,
        })
      } else {
        misses.push(task)
      }
    }

    return { hits, misses }
  }

  function renderResults(results: TranslationResult[]) {
    for (const result of results) {
      if (result.status === 'success') {
        safeRender({ blockId: result.blockId, translatedText: result.translatedText }, root)
      }
    }
  }

  return {
    start,
    translatePage,
    getProgress: () => progress,
  }
}

export function deriveProgressStatus(input: {
  translated: number
  failed: number
  total: number
}): PageTranslationProgress['status'] {
  if (input.total <= 0) return 'failed'
  if (input.translated === 0) return 'failed'
  if (input.failed > 0 || input.translated < input.total) return 'partial'
  return 'done'
}

function createTask(
  block: import('@lingoflow/types').TextBlock,
  settings: PublicRuntimeSettings,
  pageUrl: string,
  domain: string,
): TranslationTask {
  const cacheKey = buildTranslationCacheKey({
    textHash: block.textHash,
    sourceLang: settings.sourceLang,
    targetLang: settings.targetLang,
    providerId: settings.providerId,
    model: settings.model,
    promptVersion: settings.promptVersion,
    normalizeVersion: settings.normalizeVersion,
  })

  return {
    id: `task_${block.id}`,
    blockId: block.id,
    sourceText: block.text,
    requestText: block.requestText,
    normalizedText: block.normalizedText,
    textHash: block.textHash,
    inlineTokens: block.inlineTokens,
    sourceLang: settings.sourceLang,
    targetLang: settings.targetLang,
    providerId: settings.providerId,
    model: settings.model,
    promptVersion: settings.promptVersion,
    normalizeVersion: settings.normalizeVersion,
    cacheKey,
    pageUrl,
    domain,
  }
}

async function sendRuntimeMessage<T>(runtime: typeof chrome.runtime, message: unknown): Promise<T> {
  const response = (await runtime.sendMessage(message)) as MessageResponse<T>
  if (!response?.ok) {
    throw new Error(response?.error?.message ?? 'LingoFlow message failed')
  }
  return response.data
}

function idleProgress(): PageTranslationProgress {
  return {
    status: 'idle',
    sourceLang: 'auto',
    targetLang: 'zh-Hans',
    totalBlocks: 0,
    translatedBlocks: 0,
    cacheHits: 0,
    failedBlocks: 0,
  }
}

function resolveLanguage(
  override: string | undefined,
  fallback: string,
  options: Array<{ code: string }>,
): string {
  if (override && options.some(option => option.code === override)) return override
  return options.some(option => option.code === fallback) ? fallback : options[0]?.code ?? fallback
}
