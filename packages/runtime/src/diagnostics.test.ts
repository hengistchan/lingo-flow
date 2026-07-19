import { NORMALIZE_VERSION } from '@lingoflow/shared'
import type {
  MessageResponse,
  PageDiagnostics,
  PublicRuntimeSettings,
  TranslationResult,
  TranslationTask,
} from '@lingoflow/types'
import { createContentRuntime } from './index'
import { EventRingBuffer } from './event-ring-buffer'
import { RenderCoordinator } from './render-coordinator'
import { BlockStore } from './store'
import { BlockBindingStore } from './bindings'
import { RuntimeEventBus } from './events'
import { VersionTracker } from './version'
import { StrategyRegistry } from '@lingoflow/renderer'
import type { BlockBinding, RuntimeEvent } from '@lingoflow/types'

describe('page/getDiagnostics', () => {
  it('returns latest snapshot after a translation run', async () => {
    document.body.innerHTML = `
      <article>
        <p>This paragraph is long enough to be collected and translated by the runtime.</p>
      </article>
    `
    const settings = runtimeSettings()
    const chromeRuntime = fakeRuntime(async message => {
      if (message.type === 'settings/getRuntime') return success(settings)
      if (message.type === 'translation/translateBatch') {
        const tasks: TranslationTask[] = message.payload.tasks
        return success({ results: tasks.map(successResult) })
      }
      return success({})
    })

    const runtime = createContentRuntime({ document, chromeRuntime })
    await runtime.translatePage()

    const diagnostics = runtime.getDiagnostics({ includeBlocks: true })
    expect(diagnostics).not.toBeNull()
    expect(diagnostics!.pageUrl).toBe(document.location.href)
    expect(diagnostics!.domain).toBe('localhost')
    expect(diagnostics!.runId).toMatch(/^run_/)
    expect(diagnostics!.rule.id).toBe('default')
    expect(diagnostics!.rule.matchedRuleIds).toContain('default')
    expect(diagnostics!.counts.collected).toBeGreaterThanOrEqual(1)
    expect(diagnostics!.counts.rendered).toBeGreaterThanOrEqual(1)
    expect(diagnostics!.blocks).toBeDefined()
    expect(diagnostics!.blocks!.length).toBeGreaterThanOrEqual(1)
  })

  it('respects includeBlocks option', async () => {
    document.body.innerHTML = `
      <article>
        <p>This paragraph is long enough to be collected and translated by the runtime.</p>
      </article>
    `
    const settings = runtimeSettings()
    const chromeRuntime = fakeRuntime(async message => {
      if (message.type === 'settings/getRuntime') return success(settings)
      if (message.type === 'translation/translateBatch') {
        const tasks: TranslationTask[] = message.payload.tasks
        return success({ results: tasks.map(successResult) })
      }
      throw new Error(`Unexpected message: ${message.type}`)
    })

    const runtime = createContentRuntime({ document, chromeRuntime })
    await runtime.translatePage()

    const withBlocks = runtime.getDiagnostics({ includeBlocks: true })
    expect(withBlocks!.blocks).toBeDefined()
    expect(withBlocks!.blocks!.length).toBeGreaterThanOrEqual(1)

    const withoutBlocks = runtime.getDiagnostics({ includeBlocks: false })
    expect(withoutBlocks!.blocks).toBeUndefined()
  })

  it('respects includeEvents and maxEvents options', async () => {
    document.body.innerHTML = `
      <article>
        <p>This paragraph is long enough to be collected and translated by the runtime.</p>
      </article>
    `
    const settings = runtimeSettings()
    const chromeRuntime = fakeRuntime(async message => {
      if (message.type === 'settings/getRuntime') return success(settings)
      if (message.type === 'translation/translateBatch') {
        const tasks: TranslationTask[] = message.payload.tasks
        return success({ results: tasks.map(successResult) })
      }
      throw new Error(`Unexpected message: ${message.type}`)
    })

    const runtime = createContentRuntime({ document, chromeRuntime })
    await runtime.translatePage()

    const withEvents = runtime.getDiagnostics({ includeEvents: true, maxEvents: 5 })
    expect(withEvents!.events).toBeDefined()
    expect(withEvents!.events!.length).toBeLessThanOrEqual(5)

    const withoutEvents = runtime.getDiagnostics({ includeEvents: false })
    expect(withoutEvents!.events).toBeUndefined()
  })

  it('includes DOM collection counts from Phase 3', async () => {
    document.body.innerHTML = `
      <article>
        <p>First paragraph that is long enough to be collected by the scanner.</p>
        <p>Second paragraph that is long enough to be collected by the scanner.</p>
        <p>Short</p>
      </article>
    `
    const settings = runtimeSettings()
    const chromeRuntime = fakeRuntime(async message => {
      if (message.type === 'settings/getRuntime') return success(settings)
      if (message.type === 'translation/translateBatch') {
        const tasks: TranslationTask[] = message.payload.tasks
        return success({ results: tasks.map(successResult) })
      }
      return success({})
    })

    const runtime = createContentRuntime({ document, chromeRuntime })
    await runtime.translatePage()

    const diagnostics = runtime.getDiagnostics({ includeBlocks: true })!
    expect(diagnostics.counts.rootsConsidered).toBeGreaterThanOrEqual(1)
    expect(diagnostics.counts.rootsSelected).toBeGreaterThanOrEqual(1)
    expect(diagnostics.counts.candidates).toBeGreaterThanOrEqual(2)
    expect(diagnostics.counts.collected).toBeGreaterThanOrEqual(2)
    expect(diagnostics.counts.skipped).toBeGreaterThanOrEqual(1)
    expect(diagnostics.topSkipReasons).toBeDefined()
    expect(diagnostics.topSkipReasons!.length).toBeGreaterThan(0)
  })

  it('reflects translation failures with sanitized reasons', async () => {
    document.body.innerHTML = `
      <article>
        <p>This paragraph is long enough to show failure diagnostics in the snapshot.</p>
      </article>
    `
    const settings = runtimeSettings()
    const chromeRuntime = fakeRuntime(async message => {
      if (message.type === 'settings/getRuntime') return success(settings)
      if (message.type === 'translation/translateBatch') {
        const tasks: TranslationTask[] = message.payload.tasks
        return success({
          results: tasks.map(task => ({
            taskId: task.id,
            blockId: task.blockId,
            sourceText: task.sourceText,
            sourceLang: task.sourceLang,
            targetLang: task.targetLang,
            providerId: task.providerId,
            cacheKey: task.cacheKey,
            fromCache: false,
            status: 'failed' as const,
            meta: task.meta,
            error: { message: 'provider timeout', reason: 'provider_timeout' as const },
          })),
        })
      }
      return success({})
    })

    const runtime = createContentRuntime({ document, chromeRuntime })
    await runtime.translatePage()

    const diagnostics = runtime.getDiagnostics({ includeBlocks: true })!
    expect(diagnostics.counts.failed).toBeGreaterThanOrEqual(1)
    expect(diagnostics.counts.collected).toBeGreaterThanOrEqual(1)
  })

  it('reflects render skip count in diagnostics', async () => {
    document.body.innerHTML = `
      <article>
        <p>This paragraph is long enough to test render skip diagnostics tracking.</p>
      </article>
    `
    const settings = runtimeSettings()
    const chromeRuntime = fakeRuntime(async message => {
      if (message.type === 'settings/getRuntime') return success(settings)
      if (message.type === 'translation/translateBatch') {
        const tasks: TranslationTask[] = message.payload.tasks
        return success({ results: tasks.map(successResult) })
      }
      return success({})
    })

    const runtime = createContentRuntime({ document, chromeRuntime })
    await runtime.translatePage()

    const diagnostics = runtime.getDiagnostics()!
    expect(diagnostics.counts.renderSkipped).toBe(0)
    expect(diagnostics.counts.rendered).toBeGreaterThanOrEqual(1)
  })

  it('returns null before any translation run', () => {
    const chromeRuntime = fakeRuntime(async () => success(null))
    const runtime = createContentRuntime({ document, chromeRuntime })
    expect(runtime.getDiagnostics()).toBeNull()
  })
})

describe('page/diagnose', () => {
  it('performs dry-run diagnostics without provider calls', async () => {
    document.body.innerHTML = `
      <article>
        <p>This paragraph is long enough to be collected in dry-run diagnostics.</p>
      </article>
    `
    const settings = runtimeSettings()
    let providerCalls = 0
    const chromeRuntime = fakeRuntime(async message => {
      if (message.type === 'settings/getRuntime') return success(settings)
      if (message.type === 'translation/translateBatch') {
        providerCalls++
        const tasks: TranslationTask[] = message.payload.tasks
        return success({ results: tasks.map(successResult) })
      }
      throw new Error(`Unexpected message: ${message.type}`)
    })

    const runtime = createContentRuntime({ document, chromeRuntime })
    const result = await runtime.runDryDiagnostics()

    expect(providerCalls).toBe(0)
    expect(result.counts.collected).toBeGreaterThanOrEqual(1)
    expect(result.counts.translated).toBe(0)
    expect(result.counts.rendered).toBe(0)
    expect(result.rule.id).toBe('default')
  })

  it('does not leave generated translation nodes or persistent block markers', async () => {
    document.body.innerHTML = `
      <article>
        <p>This paragraph should not get block ID markers during dry-run diagnostics.</p>
      </article>
    `
    const settings = runtimeSettings()
    const chromeRuntime = fakeRuntime(async message => {
      if (message.type === 'settings/getRuntime') return success(settings)
      throw new Error(`Unexpected message: ${message.type}`)
    })

    const runtime = createContentRuntime({ document, chromeRuntime })
    await runtime.runDryDiagnostics()

    expect(document.querySelector('[data-lingoflow-block-id]')).toBeNull()
    expect(document.querySelector('[data-lingoflow-generated]')).toBeNull()
    expect(document.querySelector('[data-lingoflow-translation]')).toBeNull()
  })

  it('applies a temporary rule override to the actual dry-run collection', async () => {
    document.body.innerHTML = `
      <article>
        <p>This paragraph is long enough for the default collector but shorter than the override threshold.</p>
      </article>
    `
    const settings = runtimeSettings()
    const chromeRuntime = fakeRuntime(async message => {
      if (message.type === 'settings/getRuntime') return success(settings)
      throw new Error(`Unexpected message: ${message.type}`)
    })

    const runtime = createContentRuntime({ document, chromeRuntime })
    const result = await runtime.runDryDiagnostics({
      ruleOverride: {
        id: 'temporary-high-threshold',
        thresholds: { minTextLength: 500 },
      },
    })

    expect(result.rule.id).toBe('temporary-high-threshold')
    expect(result.rule.matchedRuleIds).toContain('temporary-high-threshold')
    expect(result.counts.collected).toBe(0)
    expect(result.topSkipReasons).toContainEqual({ reason: 'too-short', count: 1 })
    expect(document.querySelector('[data-lingoflow-block-id]')).toBeNull()
  })

  it('returns block diagnostics with correct shape', async () => {
    document.body.innerHTML = `
      <article>
        <p>This paragraph is long enough to verify block diagnostic shape in dry-run.</p>
      </article>
    `
    const settings = runtimeSettings()
    const chromeRuntime = fakeRuntime(async message => {
      if (message.type === 'settings/getRuntime') return success(settings)
      throw new Error(`Unexpected message: ${message.type}`)
    })

    const runtime = createContentRuntime({ document, chromeRuntime })
    const result = await runtime.runDryDiagnostics()

    expect(result.blocks).toBeDefined()
    expect(result.blocks!.length).toBeGreaterThanOrEqual(1)
    const block = result.blocks![0]
    expect(block.blockId).toMatch(/^block_/)
    expect(block.state).toBe('pending')
    expect(block.cacheStatus).toBe('miss')
    expect(block.translationStatus).toBe('not-requested')
    expect(block.renderStatus).toBe('not-rendered')
    expect(block.textLength).toBeGreaterThan(0)
    expect(block.tagName).toBeTruthy()
  })

  it('includes root diagnostics', async () => {
    document.body.innerHTML = `
      <article>
        <p>This paragraph is long enough to verify root diagnostics in dry-run mode.</p>
      </article>
    `
    const settings = runtimeSettings()
    const chromeRuntime = fakeRuntime(async message => {
      if (message.type === 'settings/getRuntime') return success(settings)
      throw new Error(`Unexpected message: ${message.type}`)
    })

    const runtime = createContentRuntime({ document, chromeRuntime })
    const result = await runtime.runDryDiagnostics()

    expect(result.roots).toBeDefined()
    expect(result.roots!.length).toBeGreaterThanOrEqual(1)
    expect(result.roots![0].selected).toBe(true)
  })

  it('does not write translation cache', async () => {
    document.body.innerHTML = `
      <article>
        <p>This paragraph verifies dry-run does not interact with translation cache.</p>
      </article>
    `
    const settings = { ...runtimeSettings(), cacheEnabled: true }
    let cacheResolveCalls = 0
    const chromeRuntime = fakeRuntime(async message => {
      if (message.type === 'settings/getRuntime') return success(settings)
      if (message.type === 'translation-cache/resolve') {
        cacheResolveCalls++
        return success({ hits: [], misses: message.payload.tasks })
      }
      throw new Error(`Unexpected message: ${message.type}`)
    })

    const runtime = createContentRuntime({ document, chromeRuntime })
    await runtime.runDryDiagnostics()

    expect(cacheResolveCalls).toBe(0)
  })
})

describe('EventRingBuffer', () => {
  it('stores events up to the max limit', () => {
    const buffer = new EventRingBuffer(3)
    buffer.push({ type: 'queue:changed', queued: 1, inFlight: 0 })
    buffer.push({ type: 'queue:changed', queued: 2, inFlight: 0 })
    buffer.push({ type: 'queue:changed', queued: 3, inFlight: 0 })

    expect(buffer.size()).toBe(3)
    expect(buffer.getAll()).toHaveLength(3)
  })

  it('evicts oldest events when limit is exceeded', () => {
    const buffer = new EventRingBuffer(3)
    buffer.push({ type: 'queue:changed', queued: 1, inFlight: 0 })
    buffer.push({ type: 'queue:changed', queued: 2, inFlight: 0 })
    buffer.push({ type: 'queue:changed', queued: 3, inFlight: 0 })
    buffer.push({ type: 'queue:changed', queued: 4, inFlight: 0 })

    expect(buffer.size()).toBe(3)
    const events = buffer.getAll()
    expect(events[0]).toMatchObject({ queued: 2 })
    expect(events[2]).toMatchObject({ queued: 4 })
  })

  it('getRecent returns only the requested number of events', () => {
    const buffer = new EventRingBuffer(10)
    for (let i = 0; i < 5; i++) {
      buffer.push({ type: 'queue:changed', queued: i, inFlight: 0 })
    }

    const recent = buffer.getRecent(2)
    expect(recent).toHaveLength(2)
    expect(recent[0]).toMatchObject({ queued: 3 })
    expect(recent[1]).toMatchObject({ queued: 4 })
  })

  it('clear removes all events', () => {
    const buffer = new EventRingBuffer(10)
    buffer.push({ type: 'queue:changed', queued: 1, inFlight: 0 })
    buffer.push({ type: 'queue:changed', queued: 2, inFlight: 0 })
    buffer.clear()

    expect(buffer.size()).toBe(0)
    expect(buffer.getAll()).toHaveLength(0)
  })

  it('defaults to 500 max events', () => {
    const buffer = new EventRingBuffer()
    for (let i = 0; i < 600; i++) {
      buffer.push({ type: 'queue:changed', queued: i, inFlight: 0 })
    }
    expect(buffer.size()).toBe(500)
  })
})

describe('clear resets diagnostics', () => {
  it('resets diagnostics snapshot and event ring buffer on clear', async () => {
    document.body.innerHTML = `
      <article>
        <p>This paragraph is long enough to test diagnostics clearing behavior.</p>
      </article>
    `
    const settings = runtimeSettings()
    const chromeRuntime = fakeRuntime(async message => {
      if (message.type === 'settings/getRuntime') return success(settings)
      if (message.type === 'translation/translateBatch') {
        const tasks: TranslationTask[] = message.payload.tasks
        return success({ results: tasks.map(successResult) })
      }
      return success({})
    })

    const runtime = createContentRuntime({ document, chromeRuntime })
    await runtime.translatePage()

    const before = runtime.getDiagnostics({ includeEvents: true })
    expect(before).not.toBeNull()
    expect(before!.counts.rendered).toBeGreaterThanOrEqual(1)

    runtime.clearPage()

    const after = runtime.getDiagnostics()
    expect(after).toBeNull()
  })
})

describe('RenderCoordinator render skip tracking', () => {
  it('increments render skip count when duplicate check fires', () => {
    const store = new BlockStore()
    const bindings = new BlockBindingStore()
    const events = new RuntimeEventBus()
    const version = new VersionTracker()
    const registry = StrategyRegistry.withBuiltIns()
    const coordinator = new RenderCoordinator({ store, bindings, events, version, registry })

    const carrier = document.createElement('p')
    carrier.textContent = 'Source text for duplicate check.'
    document.body.appendChild(carrier)
    const runId = version.beginRun()
    version.registerBlock('block_dup', 'hash_dup', 'sig_dup')

    store.add({
      id: 'block_dup',
      revision: 1,
      runId,
      text: 'Source text for duplicate check.',
      normalizedText: 'Source text for duplicate check.',
      textHash: 'hash_dup',
      requestText: 'Source text for duplicate check.',
      inlineTokens: [],
      state: 'translated',
      meta: {
        tagName: 'p',
        carrierTagName: 'p',
        blockType: 'paragraph',
        insertion: 'linebreak-inside',
        depth: 1,
        visible: true,
        textLength: 30,
        rootKind: 'html',
      },
      sourceLang: 'auto',
      targetLang: 'zh-Hans',
      pageUrl: 'https://example.com/page',
      domain: 'example.com',
    })
    bindings.set(createBinding('block_dup', carrier))

    const renderInput = {
      blockId: 'block_dup',
      translatedText: '翻译文本',
      runId,
      revision: 1,
      textHash: 'hash_dup',
      sourceSignature: 'sig_dup',
    }

    const first = coordinator.renderTranslation(renderInput)
    expect(first.ok).toBe(true)
    expect(coordinator.getRenderSkipCount()).toBe(0)

    const second = coordinator.renderTranslation(renderInput)
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.reason).toBe('duplicate')
    expect(coordinator.getRenderSkipCount()).toBe(1)
  })

  it('tracks multiple skip reasons', () => {
    const store = new BlockStore()
    const bindings = new BlockBindingStore()
    const events = new RuntimeEventBus()
    const version = new VersionTracker()
    const registry = StrategyRegistry.withBuiltIns()
    const coordinator = new RenderCoordinator({ store, bindings, events, version, registry })

    const result1 = coordinator.renderTranslation({
      blockId: 'nonexistent',
      translatedText: 'text',
      runId: 'run_1',
      revision: 1,
      textHash: 'hash',
      sourceSignature: 'sig',
    })
    expect(result1.ok).toBe(false)

    const result2 = coordinator.renderTranslation({
      blockId: 'nonexistent',
      translatedText: 'text',
      runId: 'run_1',
      revision: 1,
      textHash: 'hash',
      sourceSignature: 'sig',
    })
    expect(result2.ok).toBe(false)

    expect(coordinator.getRenderSkipCount()).toBe(2)
  })

  it('resets render skip count', () => {
    const store = new BlockStore()
    const bindings = new BlockBindingStore()
    const events = new RuntimeEventBus()
    const version = new VersionTracker()
    const registry = StrategyRegistry.withBuiltIns()
    const coordinator = new RenderCoordinator({ store, bindings, events, version, registry })

    coordinator.renderTranslation({
      blockId: 'nonexistent',
      translatedText: 'text',
      runId: 'run_1',
      revision: 1,
      textHash: 'hash',
      sourceSignature: 'sig',
    })

    expect(coordinator.getRenderSkipCount()).toBe(1)
    coordinator.resetRenderSkipCount()
    expect(coordinator.getRenderSkipCount()).toBe(0)
  })
})

describe('RuntimeEventBus onAny', () => {
  it('delivers all events to onAny subscribers', () => {
    const bus = new RuntimeEventBus()
    const seen: string[] = []
    bus.onAny(event => seen.push(event.type))

    bus.emit({ type: 'queue:changed', queued: 1, inFlight: 0 })
    bus.emit({ type: 'block:stateChanged', blockId: 'b1', from: 'pending', to: 'queued' })

    expect(seen).toEqual(['queue:changed', 'block:stateChanged'])
  })

  it('onAny unsubscribe stops delivery', () => {
    const bus = new RuntimeEventBus()
    const seen: string[] = []
    const off = bus.onAny(event => seen.push(event.type))

    bus.emit({ type: 'queue:changed', queued: 1, inFlight: 0 })
    off()
    bus.emit({ type: 'queue:changed', queued: 2, inFlight: 0 })

    expect(seen).toEqual(['queue:changed'])
  })

  it('removeAll clears onAny subscribers', () => {
    const bus = new RuntimeEventBus()
    const seen: string[] = []
    bus.onAny(event => seen.push(event.type))

    bus.emit({ type: 'queue:changed', queued: 1, inFlight: 0 })
    bus.removeAll()
    bus.emit({ type: 'queue:changed', queued: 2, inFlight: 0 })

    expect(seen).toEqual(['queue:changed'])
  })
})

describe('page/getDiagnostics via message handler', () => {
  it('returns diagnostics snapshot through the message handler', async () => {
    document.body.innerHTML = `
      <article>
        <p>This paragraph is long enough to test diagnostics via message handler.</p>
      </article>
    `
    const settings = runtimeSettings()
    const chromeRuntime = runtimeWithMock(async message => {
      if (message.type === 'settings/getRuntime') return success(settings)
      if (message.type === 'translation/translateBatch') {
        const tasks: TranslationTask[] = message.payload.tasks
        return success({ results: tasks.map(successResult) })
      }
      return success({})
    })

    const runtime = createContentRuntime({ document, chromeRuntime })
    runtime.start()
    await runtime.translatePage()

    const response = await chromeRuntime.sendMessage({
      type: 'page/getDiagnostics',
      payload: { includeBlocks: true, includeEvents: true, maxEvents: 10 },
    })

    expect(response.ok).toBe(true)
    const diagnostics = (response as any).data as PageDiagnostics
    expect(diagnostics.pageUrl).toBe(document.location.href)
    expect(diagnostics.blocks).toBeDefined()
    expect(diagnostics.events).toBeDefined()

    runtime.stop()
  })

  it('page/diagnose returns dry-run results without provider calls', async () => {
    document.body.innerHTML = `
      <article>
        <p>This paragraph is long enough to test dry-run diagnostics via message handler.</p>
      </article>
    `
    const settings = runtimeSettings()
    let providerCalls = 0
    const chromeRuntime = runtimeWithMock(async message => {
      if (message.type === 'settings/getRuntime') return success(settings)
      if (message.type === 'translation/translateBatch') {
        providerCalls++
        return success({ results: [] })
      }
      return success({})
    })

    const runtime = createContentRuntime({ document, chromeRuntime })
    runtime.start()

    const response = await chromeRuntime.sendMessage({
      type: 'page/diagnose',
      payload: {},
    })

    expect(response.ok).toBe(true)
    const diagnostics = (response as any).data as PageDiagnostics
    expect(providerCalls).toBe(0)
    expect(diagnostics.counts.collected).toBeGreaterThanOrEqual(1)
    expect(diagnostics.counts.translated).toBe(0)

    runtime.stop()
  })
})

function runtimeSettings(): PublicRuntimeSettings {
  return {
    sourceLang: 'auto',
    targetLang: 'zh-Hans',
    renderMode: 'below-original',
    cacheEnabled: false,
    maxCacheItems: 50000,
    translationConcurrency: 3,
    providerId: 'azure-translator',
    normalizeVersion: NORMALIZE_VERSION,
  }
}

function fakeRuntime(
  sendMessage: (message: any) => Promise<MessageResponse<any>>,
): typeof chrome.runtime {
  return {
    sendMessage,
    onMessage: {
      addListener: vi.fn(),
    },
  } as unknown as typeof chrome.runtime
}

function runtimeWithMock(
  sendMessage: (message: any) => Promise<MessageResponse<any>>,
): typeof chrome.runtime {
  const messageListeners: Array<(message: any, sender: any, sendResponse: (response: any) => void) => boolean | void> = []
  return {
    sendMessage: async (message: any) => {
      return new Promise((resolve) => {
        let handled = false
        for (const listener of messageListeners) {
          const result = listener(message, {}, (response: any) => {
            if (!handled) {
              handled = true
              resolve(response)
            }
          })
          if (result === true) return
        }
        if (!handled) {
          sendMessage(message).then(result => {
            if (!handled) {
              handled = true
              resolve(result)
            }
          })
        }
      })
    },
    onMessage: {
      addListener: vi.fn((fn: any) => {
        messageListeners.push(fn)
      }),
    },
  } as unknown as typeof chrome.runtime
}

function success<T>(data: T): MessageResponse<T> {
  return { ok: true, data }
}

function successResult(task: TranslationTask): TranslationResult {
  return {
    taskId: task.id,
    blockId: task.blockId,
    sourceText: task.sourceText,
    translatedText: `translated:${task.sourceText}`,
    insertion: task.insertion,
    sourceLang: task.sourceLang,
    targetLang: task.targetLang,
    providerId: task.providerId,
    cacheKey: task.cacheKey,
    fromCache: false,
    status: 'success',
    meta: task.meta,
  }
}

function createBinding(blockId: string, carrier: HTMLElement): BlockBinding {
  return {
    blockId,
    revision: 1,
    runId: 'run_1',
    carrierElement: carrier,
    sourceNodes: [carrier],
    commonAncestor: carrier,
    insertedNodes: [],
    hiddenSourceNodes: [],
    loadingElement: null,
    sourceSignature: 'sig_1',
    collectedAtMutationSeq: 1,
    rootGeneration: 1,
  }
}
