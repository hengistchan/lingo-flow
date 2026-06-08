import { buildTranslationCacheKey } from '@lingoflow/cache'
import { collectTextBlocks } from '@lingoflow/dom'
import { clearTranslations, safeRender } from '@lingoflow/renderer'
import { createBatches } from '@lingoflow/scheduler'
import { getDomain } from '@lingoflow/shared'
import type {
  MessageResponse,
  PageTranslationProgress,
  PublicRuntimeSettings,
  TranslationResult,
  TranslationTask,
} from '@lingoflow/types'

type RuntimeDependencies = {
  document?: Document
  chromeRuntime?: typeof chrome.runtime
}

export function createContentRuntime(dependencies: RuntimeDependencies = {}) {
  const root = dependencies.document ?? document
  const runtime = dependencies.chromeRuntime ?? chrome.runtime
  const memoryCache = new Map<string, TranslationResult>()
  let progress: PageTranslationProgress = idleProgress()

  async function translatePage() {
    progress = {
      status: 'translating',
      totalBlocks: 0,
      translatedBlocks: 0,
      cacheHits: 0,
      failedBlocks: 0,
    }

    try {
      clearTranslations(root)
      const settings = await sendRuntimeMessage<PublicRuntimeSettings>(runtime, { type: 'settings/getRuntime' })
      const pageUrl = root.location.href
      const domain = getDomain(pageUrl)
      const blocks = await collectTextBlocks(root, {
        sourceLang: settings.sourceLang,
        targetLang: settings.targetLang,
        pageUrl,
        domain,
      })
      const tasks = blocks.map(block => createTask(block.id, block.text, block.normalizedText, block.textHash, settings, pageUrl, domain))
      progress.totalBlocks = tasks.length

      if (tasks.length === 0) {
        progress.status = 'done'
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
          progress.cacheHits += cache.hits.length
          progress.translatedBlocks += cache.hits.length
          misses = cache.misses
        } catch (error) {
          console.warn('[LingoFlow] Cache resolve degraded to misses', error)
        }
      }

      for (const batch of createBatches(misses, { maxItems: 20, maxChars: 12000 })) {
        const response = await sendRuntimeMessage<{ results: TranslationResult[] }>(runtime, {
          type: 'translation/translateBatch',
          payload: { tasks: batch },
        })

        renderResults(response.results)
        for (const result of response.results) {
          if (result.status === 'success') {
            memoryCache.set(result.cacheKey, result)
            progress.translatedBlocks += 1
          } else {
            progress.failedBlocks += 1
          }
        }
      }

      progress.status = 'done'
      return progress
    } catch (error) {
      progress.status = 'failed'
      progress.message = error instanceof Error ? error.message : String(error)
      return progress
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

      if (message?.type === 'page/translate') {
        translatePage()
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
    getProgress: () => progress,
  }
}

function createTask(
  blockId: string,
  sourceText: string,
  normalizedText: string,
  textHash: string,
  settings: PublicRuntimeSettings,
  pageUrl: string,
  domain: string,
): TranslationTask {
  const cacheKey = buildTranslationCacheKey({
    textHash,
    sourceLang: settings.sourceLang,
    targetLang: settings.targetLang,
    providerId: settings.providerId,
    model: settings.model,
    promptVersion: settings.promptVersion,
    normalizeVersion: settings.normalizeVersion,
  })

  return {
    id: `task_${blockId}`,
    blockId,
    sourceText,
    normalizedText,
    textHash,
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
    totalBlocks: 0,
    translatedBlocks: 0,
    cacheHits: 0,
    failedBlocks: 0,
  }
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
