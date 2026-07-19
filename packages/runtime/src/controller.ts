import { buildTranslationCacheKey } from '@lingoflow/cache'
import { collectScanResults } from '@lingoflow/dom'
import { resolvePageRule, SITE_RULES } from '@lingoflow/rules'
import { createBatches, processBatchesWithConcurrency } from '@lingoflow/scheduler'
import { getDomain, getSourceLanguageOptions, getTargetLanguageOptions } from '@lingoflow/shared'
import type {
  BlockDiagnostic,
  CollectionDiagnostics,
  PageDiagnostics,
  PageDisplayMode,
  PageRule,
  PageTranslationProgress,
  PublicRuntimeSettings,
  ResolvedPageRule,
  RootDiagnostic,
  RuntimeContext,
  RuntimeEvent,
  ScanResult,
  TranslationResult,
  TranslationTask,
  UserSiteRule,
} from '@lingoflow/types'
import { BlockBindingStore } from './bindings'
import { EventRingBuffer } from './event-ring-buffer'
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
  siteRules?: PageRule[]
}

export type PageTranslationOverrides = {
  sourceLang?: 'auto' | string
  targetLang?: string
}

export class RuntimeController {
  private readonly root: Document
  private readonly runtime: typeof chrome.runtime
  private readonly siteRules: PageRule[]
  private readonly memoryCache = new Map<string, TranslationResult>()
  private readonly store = new BlockStore()
  private readonly bindings = new BlockBindingStore()
  private readonly events = new RuntimeEventBus()
  private readonly version = new VersionTracker()
  private readonly queue = new BlockQueue()
  private readonly coordinator: RenderCoordinator
  private readonly observer: PageObserver
  private readonly eventRingBuffer = new EventRingBuffer()
  private progress: PageTranslationProgress
  private translating = false
  private manualTranslating = false
  private dynamicTranslationEnabled = false
  private started = false
  private pendingIncremental: PageTranslationOverrides | null = null
  private latestDiagnostics: PageDiagnostics | null = null
  private latestCollectionDiagnostics: CollectionDiagnostics | null = null
  private lastResolvedRule: ResolvedPageRule | null = null
  private latestUserRules: UserSiteRule[] = []
  private memoryCacheHits = 0
  private indexeddbCacheHits = 0
  private providerRequestedCount = 0
  private pageTargetLangOverride: string | undefined = undefined

  constructor(deps: ControllerDependencies) {
    this.root = deps.document ?? document
    this.runtime = deps.chromeRuntime ?? chrome.runtime
    this.siteRules = deps.siteRules ?? SITE_RULES
    this.coordinator = new RenderCoordinator({
      store: this.store,
      bindings: this.bindings,
      events: this.events,
      version: this.version,
      document: this.root,
    })
    this.observer = new PageObserver({
      document: this.root,
      events: this.events,
      bindings: this.bindings,
      store: this.store,
    })
    this.progress = this.idleProgress()
    this.subscribeToEvents()
  }

  async translatePage(overrides: PageTranslationOverrides = {}): Promise<PageTranslationProgress> {
    if (this.translating) return this.progress
    this.translating = true
    this.manualTranslating = true

    this.progress = {
      status: 'translating',
      sourceLang: overrides.sourceLang ?? this.progress.sourceLang,
      targetLang: overrides.targetLang ?? this.progress.targetLang,
      totalBlocks: 0,
      translatedBlocks: 0,
      cacheHits: 0,
      failedBlocks: 0,
    }

    this.memoryCacheHits = 0
    this.indexeddbCacheHits = 0
    this.providerRequestedCount = 0

    try {
      const settings = await this.sendRuntimeMessage<PublicRuntimeSettings>({ type: 'settings/getRuntime' })
      this.clearGeneratedNodes()
      const sourceLang = this.resolveLanguage(overrides.sourceLang, settings.sourceLang, getSourceLanguageOptions())
      const targetLang = this.resolveLanguage(overrides.targetLang, settings.targetLang, getTargetLanguageOptions())
      const effectiveSettings = { ...settings, sourceLang, targetLang }
      this.latestUserRules = settings.userRules ?? []
      this.progress.sourceLang = sourceLang
      this.progress.targetLang = targetLang
      if (overrides.targetLang) {
        this.pageTargetLangOverride = overrides.targetLang
      }

      const runId = this.version.beginRun()
      const pageUrl = this.root.location.href
      const domain = getDomain(pageUrl)
      const context = this.createRuntimeContext({
        runId,
        settings: effectiveSettings,
        pageUrl,
        domain,
      })
      this.lastResolvedRule = context.pageRule

      const scanOutput = await collectScanResults(this.root, context)
      this.latestCollectionDiagnostics = scanOutput.diagnostics

      this.materializeBlocks(scanOutput.blocks, context)
      const tasks = this.createTasks(scanOutput.blocks, context)
      this.progress.totalBlocks = tasks.length

      if (tasks.length === 0) {
        this.progress.status = 'failed'
        this.progress.messageCode = 'no_readable_text'
        this.progress.message = 'No readable text blocks found.'
        this.updateDiagnosticsSnapshot(context)
        return this.progress
      }

      await this.translateTasks(tasks, context, settings)

      this.progress.status = this.deriveProgressStatus({
        translated: this.progress.translatedBlocks,
        failed: this.progress.failedBlocks,
        total: this.progress.totalBlocks,
      })
      this.updateDiagnosticsSnapshot(context)
      return this.progress
    } catch (error) {
      this.progress.status = 'failed'
      this.progress.messageCode = 'runtime_error'
      this.progress.message = error instanceof Error ? error.message : String(error)
      return this.progress
    } finally {
      this.translating = false
      this.manualTranslating = false
    }
  }

  start(): void {
    if (this.started) return
    this.started = true
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

      if (message?.type === 'page/enableDynamicTranslation') {
        this.enableDynamicTranslation()
        sendResponse({ ok: true, data: { enabled: true } })
        return false
      }

      if (message?.type === 'page/disableDynamicTranslation') {
        this.disableDynamicTranslation()
        sendResponse({ ok: true, data: { enabled: false } })
        return false
      }

      if (message?.type === 'page/setDynamicTranslation') {
        if (message.payload?.enabled) {
          this.enableDynamicTranslation()
        } else {
          this.disableDynamicTranslation()
        }
        sendResponse({ ok: true, data: { enabled: this.dynamicTranslationEnabled } })
        return false
      }

      if (message?.type === 'page/getDiagnostics') {
        const payload = message.payload ?? {}
        const diagnostics = this.getDiagnostics({
          includeBlocks: payload.includeBlocks,
          includeEvents: payload.includeEvents,
          maxEvents: payload.maxEvents,
        })
        sendResponse({ ok: true, data: diagnostics })
        return false
      }

      if (message?.type === 'page/diagnose') {
        this.runDryDiagnostics(message.payload)
          .then(result => sendResponse({ ok: true, data: result }))
          .catch(error => sendResponse({ ok: false, error: { message: error.message } }))
        return true
      }

      return false
    })

    this.observer.start()
  }

  stop(): void {
    this.observer.stop()
    this.started = false
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
    this.eventRingBuffer.clear()
    this.latestDiagnostics = null
    this.latestCollectionDiagnostics = null
    this.lastResolvedRule = null
    this.latestUserRules = []
    this.pageTargetLangOverride = undefined
    this.coordinator.resetRenderSkipCount()
    this.progress = this.idleProgress()
    this.observer.start()
  }

  clearMemoryCache(): void {
    this.memoryCache.clear()
  }

  setDisplayMode(mode: PageDisplayMode): void {
    this.coordinator.setDisplayMode(mode)
  }

  enableDynamicTranslation(): void {
    this.dynamicTranslationEnabled = true
  }

  disableDynamicTranslation(): void {
    this.dynamicTranslationEnabled = false
  }

  async translateIncremental(overrides: PageTranslationOverrides = {}): Promise<PageTranslationProgress> {
    if (this.translating) {
      this.pendingIncremental = overrides
      return this.progress
    }
    this.translating = true

    try {
      const settings = await this.sendRuntimeMessage<PublicRuntimeSettings>({ type: 'settings/getRuntime' })
      const sourceLang = this.resolveLanguage(overrides.sourceLang, settings.sourceLang, getSourceLanguageOptions())
      const targetLang = this.resolveLanguage(overrides.targetLang ?? this.pageTargetLangOverride, settings.targetLang, getTargetLanguageOptions())
      const effectiveSettings = { ...settings, sourceLang, targetLang }
      this.latestUserRules = settings.userRules ?? []
      if (overrides.targetLang) {
        this.pageTargetLangOverride = overrides.targetLang
      }
      const runId = this.version.beginRun()
      const pageUrl = this.root.location.href
      const domain = getDomain(pageUrl)
      const context = this.createRuntimeContext({
        runId,
        settings: effectiveSettings,
        pageUrl,
        domain,
      })
      const scanOutput = await collectScanResults(this.root, context)
      if (scanOutput.blocks.length === 0) return this.progress

      this.materializeBlocks(scanOutput.blocks, context)
      const tasks = this.createTasks(scanOutput.blocks, context)
      this.progress = {
        ...this.progress,
        status: 'translating',
        sourceLang,
        targetLang,
        totalBlocks: this.progress.totalBlocks + tasks.length,
      }

      await this.translateTasks(tasks, context, effectiveSettings)
      this.progress.status = this.deriveProgressStatus({
        translated: this.progress.translatedBlocks,
        failed: this.progress.failedBlocks,
        total: this.progress.totalBlocks,
      })
      return this.progress
    } catch (error) {
      console.warn('[LingoFlow] Incremental translation failed', error)
      return this.progress
    } finally {
      this.translating = false
      const pending = this.pendingIncremental
      this.pendingIncremental = null
      if (pending) {
        await this.translateIncremental(pending)
      }
    }
  }

  private subscribeToEvents(): void {
    this.events.onAny(event => {
      this.eventRingBuffer.push(event)
    })

    this.events.on('block:dirty', event => {
      const { blockId } = event
      const mutated = this.store.dispatch(blockId, 'DOM_MUTATED')
      if (mutated) {
        this.bindings.removeRenderedNodes(blockId)
        this.store.dispatch(blockId, 'REQUEUE')
        const block = this.store.get(blockId)
        if (block) {
          this.queue.enqueue(blockId, block.normalizedText.length)
        }
      }
    })

    this.events.on('observer:newContent', event => {
      if (event.cause === 'route-change') {
        this.handleRouteChange()
        return
      }

      if (this.dynamicTranslationEnabled && !this.manualTranslating) {
        this.translateIncremental().catch(error => {
          console.warn('[LingoFlow] Dynamic translation failed', error)
        })
      }
    })

    this.events.on('binding:disconnected', event => {
      this.bindings.remove(event.blockId)
      this.version.removeBlock(event.blockId)
    })
  }

  private handleRouteChange(): void {
    for (const block of this.store.all()) {
      if (block.state === 'rendered' || block.state === 'translated' || block.state === 'cache-hit') {
        this.store.dispatch(block.id, 'MARK_STALE')
      }
      this.bindings.removeRenderedNodes(block.id)
    }

    this.queue.clear()
    this.store.clear()
    this.bindings.clear()
    const newRootGeneration = this.version.nextRootGeneration()

    this.lastResolvedRule = resolvePageRule(this.root, this.root.location.href, { siteRules: this.siteRules, userRules: this.latestUserRules })

    if (this.latestDiagnostics) {
      this.latestDiagnostics = {
        ...this.latestDiagnostics,
        rootGeneration: newRootGeneration,
        rule: {
          id: this.lastResolvedRule.id,
          matchedRuleIds: this.lastResolvedRule.matchedRuleIds,
          selectors: this.lastResolvedRule.selectors,
          thresholds: this.lastResolvedRule.thresholds,
          behavior: this.lastResolvedRule.behavior,
        },
        dynamicTranslationEnabled: this.dynamicTranslationEnabled,
        dynamicTranslationMode: this.getDynamicTranslationMode(),
        counts: {
          ...this.latestDiagnostics.counts,
          queued: 0,
          rendered: 0,
          stale: this.latestDiagnostics.counts.rendered,
        },
      }
    }

    if (this.dynamicTranslationEnabled) {
      this.translateIncremental().catch(error => {
        console.warn('[LingoFlow] Dynamic route translation failed', error)
      })
    }
  }

  private getDynamicTranslationMode(): string {
    if (!this.dynamicTranslationEnabled) return 'disabled'
    if (this.manualTranslating) return 'paused'
    return 'enabled'
  }

  private createRuntimeContext(input: {
    runId: string
    settings: PublicRuntimeSettings
    pageUrl: string
    domain: string
  }): RuntimeContext {
    const pageRule = resolvePageRule(this.root, input.pageUrl, { siteRules: this.siteRules, userRules: this.latestUserRules })
    return Object.freeze({
      runId: input.runId,
      url: input.pageUrl,
      domain: input.domain,
      sourceLang: input.settings.sourceLang,
      targetLang: input.settings.targetLang,
      providerId: input.settings.providerId,
      model: input.settings.model,
      displayMode: input.settings.displayMode ?? pageRule.behavior.displayMode,
      settings: Object.freeze({ ...input.settings }),
      pageRule,
      rootGeneration: this.version.currentRootGeneration(),
    })
  }

  private materializeBlocks(scanResults: ScanResult[], context: RuntimeContext): void {
    for (const { block, binding } of scanResults) {
      const version = this.version.registerBlock(block.id, block.textHash, binding.sourceSignature, context.rootGeneration)
      const versionedBlock = {
        ...block,
        revision: version.revision,
        runId: context.runId,
      }
      this.store.add(versionedBlock)
      this.bindings.set({
        ...binding,
        revision: version.revision,
        runId: context.runId,
        insertedNodes: [],
        hiddenSourceNodes: [],
        loadingElement: null,
        errorElement: null,
        collectedAtMutationSeq: version.collectedAtMutationSeq,
        rootGeneration: version.rootGeneration,
      })
    }
  }

  private createTasks(
    scanResults: ScanResult[],
    context: RuntimeContext,
  ): TranslationTask[] {
    return scanResults.map(({ block }) => {
      const cacheKey = buildTranslationCacheKey({
        textHash: block.textHash,
        sourceLang: context.sourceLang,
        targetLang: context.targetLang,
        providerId: context.providerId,
        model: context.model,
        promptVersion: context.settings.promptVersion,
        normalizeVersion: context.settings.normalizeVersion,
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
        sourceLang: context.sourceLang,
        targetLang: context.targetLang,
        providerId: context.providerId,
        model: context.model,
        promptVersion: context.settings.promptVersion,
        normalizeVersion: context.settings.normalizeVersion,
        cacheKey,
        pageUrl: context.url,
        domain: context.domain,
        meta: {
          url: context.url,
          domain: context.domain,
          ruleId: context.pageRule.id,
          runId: context.runId,
          rootGeneration: context.rootGeneration,
        },
      }
    })
  }

  private async translateTasks(
    tasks: TranslationTask[],
    context: RuntimeContext,
    settings: PublicRuntimeSettings,
  ): Promise<void> {
    const { hits: memoryHits, misses: memoryMisses } = this.resolveMemoryCache(tasks)

    for (const hit of memoryHits) {
      this.store.dispatch(hit.blockId, 'LOADING_START')
      this.store.dispatch(hit.blockId, 'CACHE_HIT')
    }
    this.renderResults(memoryHits, context)
    this.memoryCacheHits += memoryHits.length
    this.progress.cacheHits += memoryHits.length
    this.progress.translatedBlocks += memoryHits.length

    let misses = memoryMisses
    for (const task of misses) {
      this.store.dispatch(task.blockId, 'ENQUEUE')
      this.store.dispatch(task.blockId, 'LOADING_START')
    }

    if (settings.cacheEnabled && misses.length > 0) {
      try {
        const cache = await this.sendRuntimeMessage<{
          hits: TranslationResult[]
          misses: TranslationTask[]
        }>({
          type: 'translation-cache/resolve',
          payload: { tasks: misses },
        })

        for (const hit of cache.hits) {
          this.store.dispatch(hit.blockId, 'CACHE_HIT')
        }
        this.renderResults(cache.hits, context)
        for (const hit of cache.hits) this.memoryCache.set(hit.cacheKey, hit)
        this.evictOldestCacheEntries()
        this.indexeddbCacheHits += cache.hits.length
        this.progress.cacheHits += cache.hits.length
        this.progress.translatedBlocks += cache.hits.length
        misses = cache.misses
      } catch (error) {
        console.warn('[LingoFlow] Cache resolve degraded to misses', error)
      }
    }

    this.providerRequestedCount += misses.length

    const batches = createBatches(misses, {
      maxItems: DEFAULT_MAX_BATCH_ITEMS,
      maxChars: DEFAULT_MAX_BATCH_CHARS,
    })
    for (const task of misses) {
      this.coordinator.renderLoading(task.blockId)
    }

    await processBatchesWithConcurrency(batches, settings.translationConcurrency, async batch => {
      for (const task of batch) {
        this.store.dispatch(task.blockId, 'TRANSLATE_START')
      }
      try {
        const response = await this.sendRuntimeMessage<{ results: TranslationResult[] }>({
          type: 'translation/translateBatch',
          payload: { tasks: batch },
        })

        this.renderResults(response.results, context)
      for (const result of response.results) {
        if (result.status === 'success') {
          this.memoryCache.set(result.cacheKey, result)
          this.evictOldestCacheEntries()
          this.progress.translatedBlocks += 1
        } else {
          this.store.dispatch(result.blockId, 'TRANSLATE_FAIL')
          this.progress.failedBlocks += 1
          this.coordinator.renderError(result.blockId, result.error.message)
        }
      }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        for (const task of batch) {
          this.store.dispatch(task.blockId, 'TRANSLATE_FAIL')
          this.progress.failedBlocks += 1
          this.coordinator.renderError(task.blockId, message)
        }
        console.warn('[LingoFlow] Batch translation failed', error)
      }

      this.runtime.sendMessage({
        type: 'page/progressUpdate',
        payload: { ...this.progress },
      }).catch(() => {})
    })
  }

  private renderResults(results: TranslationResult[], context: RuntimeContext): void {
    for (const result of results) {
      if (result.status !== 'success') continue

      const block = this.store.get(result.blockId)
      if (!block) continue

      this.store.dispatch(result.blockId, 'TRANSLATE_SUCCESS')

      this.coordinator.renderTranslation({
        blockId: result.blockId,
        translatedText: result.translatedText,
        runId: result.meta?.runId ?? context.runId,
        revision: block.revision,
        textHash: block.textHash,
        sourceSignature: this.bindings.get(result.blockId)?.sourceSignature ?? '',
      })
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
          meta: task.meta,
        })
      } else {
        misses.push(task)
      }
    }

    return { hits, misses }
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

  getDiagnostics(options?: {
    includeBlocks?: boolean
    includeEvents?: boolean
    maxEvents?: number
  }): PageDiagnostics | null {
    if (!this.latestDiagnostics) return null

    const snapshot: PageDiagnostics = { ...this.latestDiagnostics }

    if (!options?.includeBlocks) {
      delete snapshot.blocks
    }

    if (options?.includeEvents) {
      const maxEvents = options.maxEvents ?? 500
      snapshot.events = this.eventRingBuffer.getRecent(maxEvents)
    } else {
      delete snapshot.events
    }

    return snapshot
  }

  async runDryDiagnostics(payload?: {
    ruleOverride?: PageRule
    includeSkipped?: boolean
  }): Promise<PageDiagnostics> {
    const settings = await this.sendRuntimeMessage<PublicRuntimeSettings>({ type: 'settings/getRuntime' })
    const pageUrl = this.root.location.href
    const domain = getDomain(pageUrl)
    const userRules = settings.userRules ?? []
    const resolvedRule = payload?.ruleOverride
      ? resolvePageRule(this.root, pageUrl, {
          siteRules: this.siteRules,
          userRules,
          overrides: payload.ruleOverride,
        })
      : resolvePageRule(this.root, pageUrl, { siteRules: this.siteRules, userRules })

    const runId = `dry-run_${Date.now()}`
    const rootGeneration = this.version.currentRootGeneration()
    const scanOutput = await collectScanResults(this.root, {
      runId,
      url: pageUrl,
      domain,
      sourceLang: settings.sourceLang,
      targetLang: settings.targetLang,
      providerId: settings.providerId,
      model: settings.model,
      displayMode: settings.displayMode ?? resolvedRule.behavior.displayMode,
      settings,
      pageRule: resolvedRule,
      rootGeneration,
      dryRun: true,
    })

    const blockDiagnostics: BlockDiagnostic[] = scanOutput.blocks.map(({ block }) => ({
      blockId: block.id,
      revision: block.revision,
      state: block.state,
      textLength: block.meta.textLength,
      blockType: block.meta.blockType,
      tagName: block.meta.tagName,
      carrierTagName: block.meta.carrierTagName,
      insertion: block.meta.insertion,
      rootKind: block.meta.rootKind,
      rootGeneration: block.meta.rootGeneration,
      cacheStatus: 'miss' as const,
      translationStatus: 'not-requested' as const,
      renderStatus: 'not-rendered' as const,
    }))

    const topSkipReasons = Object.entries(scanOutput.diagnostics.skipReasons)
      .map(([reason, count]) => ({ reason, count: count ?? 0 }))
      .sort((a, b) => b.count - a.count)

    return {
      pageUrl,
      domain,
      runId,
      rootGeneration,
      rule: {
        id: resolvedRule.id,
        matchedRuleIds: resolvedRule.matchedRuleIds,
        selectors: resolvedRule.selectors,
        thresholds: resolvedRule.thresholds,
        behavior: resolvedRule.behavior,
      },
      dynamicTranslationEnabled: this.dynamicTranslationEnabled,
      dynamicTranslationMode: this.getDynamicTranslationMode(),
      displayMode: this.coordinator.getDisplayMode(),
      counts: {
        rootsConsidered: scanOutput.diagnostics.rootsConsidered,
        rootsSelected: scanOutput.diagnostics.rootsSelected,
        candidates: scanOutput.diagnostics.candidateCount,
        collected: scanOutput.diagnostics.acceptedBlockCount,
        skipped: scanOutput.diagnostics.skippedCandidateCount,
        queued: 0,
        cacheHit: 0,
        translated: 0,
        failed: 0,
        rendered: 0,
        renderSkipped: 0,
        stale: 0,
        discarded: 0,
      },
      roots: scanOutput.diagnostics.selectedRoots,
      rejectedRoots: scanOutput.diagnostics.rejectedRootDetails,
      blocks: blockDiagnostics,
      topSkipReasons,
    }
  }

  private updateDiagnosticsSnapshot(context: RuntimeContext): void {
    const blocks = this.store.all()
    const blockDiagnostics = blocks.map(block => this.buildBlockDiagnostic(block))

    const stateCounts = {
      queued: 0,
      cacheHit: 0,
      translated: 0,
      failed: 0,
      rendered: 0,
      stale: 0,
      discarded: 0,
    }

    for (const block of blocks) {
      switch (block.state) {
        case 'queued':
        case 'loading':
          stateCounts.queued++
          break
        case 'cache-hit':
          stateCounts.cacheHit++
          break
        case 'translating':
        case 'translated':
        case 'rendering':
          stateCounts.translated++
          break
        case 'failed':
          stateCounts.failed++
          break
        case 'rendered':
          stateCounts.rendered++
          break
        case 'stale':
          stateCounts.stale++
          break
        case 'cancelled':
          stateCounts.discarded++
          break
      }
    }

    const collectionDiag = this.latestCollectionDiagnostics
    const topSkipReasons = collectionDiag
      ? Object.entries(collectionDiag.skipReasons)
          .map(([reason, count]) => ({ reason, count: count ?? 0 }))
          .sort((a, b) => b.count - a.count)
      : []

    this.latestDiagnostics = {
      pageUrl: context.url,
      domain: context.domain,
      runId: context.runId,
      rootGeneration: this.version.currentRootGeneration(),
      rule: {
        id: context.pageRule.id,
        matchedRuleIds: context.pageRule.matchedRuleIds,
        selectors: context.pageRule.selectors,
        thresholds: context.pageRule.thresholds,
        behavior: context.pageRule.behavior,
      },
      dynamicTranslationEnabled: this.dynamicTranslationEnabled,
      dynamicTranslationMode: this.getDynamicTranslationMode(),
      displayMode: context.displayMode,
      counts: {
        rootsConsidered: collectionDiag?.rootsConsidered ?? 0,
        rootsSelected: collectionDiag?.rootsSelected ?? 0,
        candidates: collectionDiag?.candidateCount ?? 0,
        collected: collectionDiag?.acceptedBlockCount ?? 0,
        skipped: collectionDiag?.skippedCandidateCount ?? 0,
        ...stateCounts,
        renderSkipped: this.coordinator.getRenderSkipCount(),
      },
      roots: collectionDiag?.selectedRoots,
      rejectedRoots: collectionDiag?.rejectedRootDetails,
      blocks: blockDiagnostics,
      topSkipReasons,
      userMessageCode: this.progress.messageCode,
    }
  }

  private buildBlockDiagnostic(block: import('@lingoflow/types').TranslationBlock): BlockDiagnostic {
    const isRendered = block.state === 'rendered'
    const isFailed = block.state === 'failed'
    const isStale = block.state === 'stale'
    const isCancelled = block.state === 'cancelled'

    let cacheStatus: BlockDiagnostic['cacheStatus'] = 'miss'
    if (block.state === 'cache-hit' || block.state === 'rendered') {
      cacheStatus = this.memoryCache.has(block.textHash) ? 'memory-hit' : 'indexeddb-hit'
    }

    let translationStatus: BlockDiagnostic['translationStatus'] = 'not-requested'
    if (isFailed) translationStatus = 'failed'
    else if (isCancelled) translationStatus = 'discarded'
    else if (block.state === 'translating' || block.state === 'loading' || block.state === 'queued') translationStatus = 'requested'
    else if (block.state === 'translated' || block.state === 'cache-hit' || block.state === 'rendering' || block.state === 'rendered') translationStatus = 'success'

    let renderStatus: BlockDiagnostic['renderStatus'] = 'not-rendered'
    if (isRendered) renderStatus = 'rendered'
    else if (block.state === 'rendering' || block.state === 'translated' || block.state === 'cache-hit') renderStatus = 'skipped'

    return {
      blockId: block.id,
      revision: block.revision,
      state: block.state,
      textLength: block.meta.textLength,
      blockType: block.meta.blockType,
      tagName: block.meta.tagName,
      carrierTagName: block.meta.carrierTagName,
      insertion: block.meta.insertion,
      rootKind: block.meta.rootKind,
      rootGeneration: block.meta.rootGeneration,
      cacheStatus,
      translationStatus,
      renderStatus,
      skipReason: isFailed ? (block.failure?.reason ?? undefined) : undefined,
    }
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
