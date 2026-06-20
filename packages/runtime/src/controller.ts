import { buildTranslationCacheKey } from '@lingoflow/cache'
import { collectScanResults, type CollectScanResultOptions } from '@lingoflow/dom'
import { getDomain, getSourceLanguageOptions, getTargetLanguageOptions } from '@lingoflow/shared'
import type {
  PageDisplayMode,
  PageTranslationProgress,
  PublicRuntimeSettings,
  ScanResult,
  TranslationResult,
  TranslationTask,
} from '@lingoflow/types'
import { BlockBindingStore } from './bindings'
import { RuntimeEventBus } from './events'
import { PageObserver } from './observer'
import { BlockQueue } from './queue'
import { RenderCoordinator } from './render-coordinator'
import { BlockStore } from './store'
import { VersionTracker } from './version'

const MAX_MEMORY_CACHE_ENTRIES = 500
const DEFAULT_MAX_BATCH_ITEMS = 20
const DEFAULT_MAX_BATCH_CHARS = 12000

export type ControllerDependencies = {
  document?: Document
  chromeRuntime?: typeof chrome.runtime
}

export type PageTranslationOverrides = {
  sourceLang?: 'auto' | string
  targetLang?: string
}

export class RuntimeController {
  private readonly root: Document
  private readonly runtime: typeof chrome.runtime
  private readonly memoryCache = new Map<string, TranslationResult>()
  private readonly store = new BlockStore()
  private readonly bindings = new BlockBindingStore()
  private readonly events = new RuntimeEventBus()
  private readonly version = new VersionTracker()
  private readonly queue = new BlockQueue()
  private readonly coordinator: RenderCoordinator
  private readonly observer: PageObserver
  private progress: PageTranslationProgress
  private translating = false

  constructor(deps: ControllerDependencies) {
    this.root = deps.document ?? document
    this.runtime = deps.chromeRuntime ?? chrome.runtime
    this.coordinator = new RenderCoordinator({
      store: this.store,
      bindings: this.bindings,
      events: this.events,
      version: this.version,
    })
    this.observer = new PageObserver({
      document: this.root,
      events: this.events,
      bindings: this.bindings,
      store: this.store,
    })
    this.progress = this.idleProgress()
  }

  async translatePage(overrides: PageTranslationOverrides = {}): Promise<PageTranslationProgress> {
    if (this.translating) return this.progress
    this.translating = true

    this.progress = {
      status: 'translating',
      sourceLang: overrides.sourceLang ?? this.progress.sourceLang,
      targetLang: overrides.targetLang ?? this.progress.targetLang,
      totalBlocks: 0,
      translatedBlocks: 0,
      cacheHits: 0,
      failedBlocks: 0,
    }

    try {
      this.clearGeneratedNodes()
      const settings = await this.sendRuntimeMessage<PublicRuntimeSettings>({ type: 'settings/getRuntime' })
      const sourceLang = this.resolveLanguage(overrides.sourceLang, settings.sourceLang, getSourceLanguageOptions())
      const targetLang = this.resolveLanguage(overrides.targetLang, settings.targetLang, getTargetLanguageOptions())
      const effectiveSettings = { ...settings, sourceLang, targetLang }
      this.progress.sourceLang = sourceLang
      this.progress.targetLang = targetLang

      const runId = this.version.beginRun()
      const pageUrl = this.root.location.href
      const domain = getDomain(pageUrl)

      const scanResults = await collectScanResults(this.root, {
        sourceLang,
        targetLang,
        pageUrl,
        domain,
        runId,
        rootGeneration: 1,
      })

      this.materializeBlocks(scanResults, runId)
      const tasks = this.createTasks(scanResults, effectiveSettings, pageUrl, domain)
      this.progress.totalBlocks = tasks.length

      if (tasks.length === 0) {
        this.progress.status = 'failed'
        this.progress.messageCode = 'no_readable_text'
        this.progress.message = 'No readable text blocks found.'
        return this.progress
      }

      const { hits: memoryHits, misses: memoryMisses } = this.resolveMemoryCache(tasks)
      this.renderResults(memoryHits, runId)
      this.progress.cacheHits += memoryHits.length
      this.progress.translatedBlocks += memoryHits.length

      let misses = memoryMisses
      if (settings.cacheEnabled && misses.length > 0) {
        try {
          const cache = await this.sendRuntimeMessage<{
            hits: TranslationResult[]
            misses: TranslationTask[]
          }>({
            type: 'translation-cache/resolve',
            payload: { tasks: misses },
          })

          this.renderResults(cache.hits, runId)
          for (const hit of cache.hits) this.memoryCache.set(hit.cacheKey, hit)
          this.evictOldestCacheEntries()
          this.progress.cacheHits += cache.hits.length
          this.progress.translatedBlocks += cache.hits.length
          misses = cache.misses
        } catch (error) {
          console.warn('[LingoFlow] Cache resolve degraded to misses', error)
        }
      }

      const batches = this.createBatches(misses)
      await this.processBatchesWithConcurrency(batches, settings.translationConcurrency, async batch => {
        try {
          const response = await this.sendRuntimeMessage<{ results: TranslationResult[] }>({
            type: 'translation/translateBatch',
            payload: { tasks: batch },
          })

          this.renderResults(response.results, runId)
          for (const result of response.results) {
            if (result.status === 'success') {
              this.memoryCache.set(result.cacheKey, result)
              this.evictOldestCacheEntries()
              this.progress.translatedBlocks += 1
            } else {
              this.progress.failedBlocks += 1
            }
          }
        } catch (error) {
          for (const task of batch) {
            this.progress.failedBlocks += 1
          }
          console.warn('[LingoFlow] Batch translation failed', error)
        }

        this.runtime.sendMessage({
          type: 'page/progressUpdate',
          payload: { ...this.progress },
        }).catch(() => {})
      })

      this.progress.status = this.deriveProgressStatus({
        translated: this.progress.translatedBlocks,
        failed: this.progress.failedBlocks,
        total: this.progress.totalBlocks,
      })
      return this.progress
    } catch (error) {
      this.progress.status = 'failed'
      this.progress.messageCode = 'runtime_error'
      this.progress.message = error instanceof Error ? error.message : String(error)
      return this.progress
    } finally {
      this.translating = false
    }
  }

  start(): void {
    this.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === 'page/status') {
        sendResponse({ ok: true, data: this.progress })
        return false
      }

      if (message?.type === 'page/clear') {
        this.clearPage()
        sendResponse({ ok: true, data: this.progress })
        return false
      }

      if (message?.type === 'page/clearCache') {
        this.clearMemoryCache()
        sendResponse({ ok: true, data: { cleared: true } })
        return false
      }

      if (message?.type === 'page/translate') {
        this.translatePage((message.payload ?? {}) as PageTranslationOverrides)
          .then(result => sendResponse({ ok: true, data: result }))
          .catch(error => sendResponse({ ok: false, error: { message: error.message } }))
        return true
      }

      if (message?.type === 'page/setDisplayMode') {
        this.setDisplayMode(message.payload?.mode ?? 'dual')
        sendResponse({ ok: true, data: { mode: message.payload?.mode } })
        return false
      }

      return false
    })

    this.observer.start()
  }

  getProgress(): PageTranslationProgress {
    return this.progress
  }

  clearPage(): void {
    this.observer.stop()
    this.clearGeneratedNodes()
    this.bindings.clear()
    this.store.clear()
    this.queue.clear()
    this.memoryCache.clear()
    this.progress = this.idleProgress()
    this.observer.start()
  }

  clearMemoryCache(): void {
    this.memoryCache.clear()
  }

  setDisplayMode(mode: PageDisplayMode): void {
    this.coordinator.setDisplayMode(mode)
  }

  private materializeBlocks(scanResults: ScanResult[], runId: string): void {
    for (const { block, binding } of scanResults) {
      this.store.add(block)
      this.bindings.set({
        ...binding,
        revision: block.revision,
        runId,
        insertedNodes: [],
        hiddenSourceNodes: [],
        loadingElement: null,
        collectedAtMutationSeq: this.version.currentMutationSeq(),
        rootGeneration: 1,
      })
      this.version.registerBlock(block.id, block.textHash, binding.sourceSignature)
    }
  }

  private createTasks(
    scanResults: ScanResult[],
    settings: PublicRuntimeSettings,
    pageUrl: string,
    domain: string,
  ): TranslationTask[] {
    return scanResults.map(({ block }) => {
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
        insertion: block.meta.insertion,
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
    })
  }

  private renderResults(results: TranslationResult[], runId: string): void {
    for (const result of results) {
      if (result.status !== 'success') continue

      const block = this.store.get(result.blockId)
      if (!block) continue

      const renderResult = this.coordinator.renderTranslation({
        blockId: result.blockId,
        translatedText: result.translatedText,
        runId,
        revision: block.revision,
        textHash: block.textHash,
        sourceSignature: this.bindings.get(result.blockId)?.sourceSignature,
      })

      if (renderResult.ok) {
        this.store.dispatch(result.blockId, 'ENQUEUE')
        this.store.dispatch(result.blockId, 'TRANSLATE_START')
        this.store.dispatch(result.blockId, 'TRANSLATE_SUCCESS')
      }
    }
  }

  private resolveMemoryCache(tasks: TranslationTask[]) {
    const hits: TranslationResult[] = []
    const misses: TranslationTask[] = []

    for (const task of tasks) {
      const cached = this.memoryCache.get(task.cacheKey)
      if (cached?.status === 'success') {
        hits.push({
          ...cached,
          taskId: task.id,
          blockId: task.blockId,
          sourceText: task.sourceText,
          insertion: task.insertion,
          fromCache: true,
        })
      } else {
        misses.push(task)
      }
    }

    return { hits, misses }
  }

  private createBatches(tasks: TranslationTask[]): TranslationTask[][] {
    const batches: TranslationTask[][] = []
    let currentBatch: TranslationTask[] = []
    let currentChars = 0

    for (const task of tasks) {
      if (currentBatch.length >= DEFAULT_MAX_BATCH_ITEMS || currentChars + task.normalizedText.length > DEFAULT_MAX_BATCH_CHARS) {
        if (currentBatch.length > 0) batches.push(currentBatch)
        currentBatch = []
        currentChars = 0
      }
      currentBatch.push(task)
      currentChars += task.normalizedText.length
    }

    if (currentBatch.length > 0) batches.push(currentBatch)
    return batches
  }

  private async processBatchesWithConcurrency(
    batches: TranslationTask[][],
    concurrency: number,
    processBatch: (batch: TranslationTask[]) => Promise<void>,
  ) {
    const workerCount = Math.max(1, Math.min(Math.floor(concurrency) || 1, batches.length))
    let nextIndex = 0

    await Promise.all(Array.from({ length: workerCount }, async () => {
      while (true) {
        const batchIndex = nextIndex++
        if (batchIndex >= batches.length) break
        await processBatch(batches[batchIndex])
      }
    }))
  }

  private clearGeneratedNodes(): void {
    this.bindings.clear()
    const root = this.root
    const generatedNodes = new Set<Node>([
      ...root.querySelectorAll('[data-lingoflow-generated="true"]'),
      ...root.querySelectorAll('[data-lingoflow-translation]'),
      ...root.querySelectorAll('[data-lingoflow-translation-break]'),
      ...root.querySelectorAll('[data-lingoflow-translation-spacer]'),
    ])

    for (const node of generatedNodes) {
      node.parentNode?.removeChild(node)
    }

    root.querySelectorAll('[data-lingoflow-block-id]').forEach(node => {
      if (node instanceof HTMLElement) {
        delete node.dataset.lingoflowBlockId
        node.removeAttribute('data-lingoflow-block-id')
      }
    })
  }

  private evictOldestCacheEntries(): void {
    while (this.memoryCache.size > MAX_MEMORY_CACHE_ENTRIES) {
      const oldestKey = this.memoryCache.keys().next().value
      if (oldestKey !== undefined) this.memoryCache.delete(oldestKey)
    }
  }

  private deriveProgressStatus(input: {
    translated: number
    failed: number
    total: number
  }): PageTranslationProgress['status'] {
    if (input.total <= 0) return 'failed'
    if (input.translated === 0) return 'failed'
    if (input.failed > 0 || input.translated < input.total) return 'partial'
    return 'done'
  }

  private async sendRuntimeMessage<T>(message: unknown): Promise<T> {
    const response = (await this.runtime.sendMessage(message)) as { ok: boolean; data?: T; error?: { message: string } }
    if (!response?.ok) {
      throw new Error(response?.error?.message ?? 'LingoFlow message failed')
    }
    return response.data as T
  }

  private idleProgress(): PageTranslationProgress {
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

  private resolveLanguage(
    override: string | undefined,
    fallback: string,
    options: Array<{ code: string }>,
  ): string {
    if (override && options.some(option => option.code === override)) return override
    return options.some(option => option.code === fallback) ? fallback : options[0]?.code ?? fallback
  }
}
