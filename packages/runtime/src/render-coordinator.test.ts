import { RenderCoordinator } from './render-coordinator'
import { BlockStore } from './store'
import { BlockBindingStore } from './bindings'
import { RuntimeEventBus } from './events'
import { VersionTracker } from './version'
import { StrategyRegistry } from '@lingoflow/renderer'
import type { BlockBinding, RuntimeEvent } from '@lingoflow/types'

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

describe('RenderCoordinator', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
  })

  it('skips render with missing-binding when block has no binding', () => {
    const { coordinator, events } = createCoordinator()
    const seen: RuntimeEvent[] = []
    events.on('render:skipped', e => seen.push(e))

    const result = coordinator.renderTranslation({
      blockId: 'block_missing',
      translatedText: '译文',
      runId: 'run_1',
      revision: 1,
      textHash: 'hash_1',
      sourceSignature: 'sig_1',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('missing-binding')
    expect(seen).toHaveLength(1)
  })

  it('skips render with detached when carrier is not connected', () => {
    const { coordinator, bindings, store, events } = createCoordinator()
    const seen: RuntimeEvent[] = []
    events.on('render:skipped', e => seen.push(e))

    const carrier = document.createElement('p')
    carrier.textContent = 'Detached carrier text that is long enough.'
    store.add({
      id: 'block_1',
      revision: 1,
      runId: 'run_1',
      text: 'Detached carrier text that is long enough.',
      normalizedText: 'Detached carrier text that is long enough.',
      textHash: 'hash_1',
      requestText: 'Detached carrier text that is long enough.',
      inlineTokens: [],
      state: 'translated',
      translatedText: '译文',
      meta: {
        tagName: 'p',
        carrierTagName: 'p',
        blockType: 'paragraph',
        insertion: 'linebreak-inside',
        depth: 1,
        visible: true,
        textLength: 40,
        rootKind: 'html',
      },
      sourceLang: 'auto',
      targetLang: 'zh-Hans',
      pageUrl: 'https://example.com/page',
      domain: 'example.com',
    })
    bindings.set(createBinding('block_1', carrier))

    const result = coordinator.renderTranslation({
      blockId: 'block_1',
      translatedText: '译文',
      runId: 'run_1',
      revision: 1,
      textHash: 'hash_1',
      sourceSignature: 'sig_1',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('detached')
  })

  it('skips render with stale when version is outdated', () => {
    const { coordinator, bindings, store, version, events } = createCoordinator()
    const seen: RuntimeEvent[] = []
    events.on('render:skipped', e => seen.push(e))

    const carrier = document.createElement('p')
    carrier.textContent = 'Source text for stale check.'
    document.body.appendChild(carrier)
    const runId = version.beginRun()
    version.registerBlock('block_1', 'hash_1', 'sig_1')

    store.add({
      id: 'block_1',
      revision: 1,
      runId,
      text: 'Source text for stale check.',
      normalizedText: 'Source text for stale check.',
      textHash: 'hash_1',
      requestText: 'Source text for stale check.',
      inlineTokens: [],
      state: 'translated',
      translatedText: '译文',
      meta: {
        tagName: 'p',
        carrierTagName: 'p',
        blockType: 'paragraph',
        insertion: 'linebreak-inside',
        depth: 1,
        visible: true,
        textLength: 29,
        rootKind: 'html',
      },
      sourceLang: 'auto',
      targetLang: 'zh-Hans',
      pageUrl: 'https://example.com/page',
      domain: 'example.com',
    })
    bindings.set(createBinding('block_1', carrier))

    const result = coordinator.renderTranslation({
      blockId: 'block_1',
      translatedText: '译文',
      runId: 'old_run',
      revision: 1,
      textHash: 'hash_1',
      sourceSignature: 'sig_1',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('stale')
  })

  it('skips render with same-text when translated text equals source', () => {
    const { coordinator, bindings, store, version } = createCoordinator()
    const carrier = document.createElement('p')
    carrier.textContent = 'Same text content.'
    document.body.appendChild(carrier)
    const runId = version.beginRun()
    version.registerBlock('block_1', 'hash_1', 'sig_1')

    store.add({
      id: 'block_1',
      revision: 1,
      runId,
      text: 'Same text content.',
      normalizedText: 'Same text content.',
      textHash: 'hash_1',
      requestText: 'Same text content.',
      inlineTokens: [],
      state: 'translated',
      translatedText: 'Same text content.',
      meta: {
        tagName: 'p',
        carrierTagName: 'p',
        blockType: 'paragraph',
        insertion: 'linebreak-inside',
        depth: 1,
        visible: true,
        textLength: 19,
        rootKind: 'html',
      },
      sourceLang: 'auto',
      targetLang: 'zh-Hans',
      pageUrl: 'https://example.com/page',
      domain: 'example.com',
    })
    bindings.set(createBinding('block_1', carrier))

    const result = coordinator.renderTranslation({
      blockId: 'block_1',
      translatedText: 'Same text content.',
      runId,
      revision: 1,
      textHash: 'hash_1',
      sourceSignature: 'sig_1',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('same-text')
  })

  it('successfully renders translation and updates state to rendered', () => {
    const { coordinator, bindings, store, version, events } = createCoordinator()
    const seen: RuntimeEvent[] = []
    events.on('render:committed', e => seen.push(e))

    const carrier = document.createElement('p')
    carrier.textContent = 'Source text for rendering.'
    document.body.appendChild(carrier)
    const runId = version.beginRun()
    version.registerBlock('block_1', 'hash_1', 'sig_1')

    store.add({
      id: 'block_1',
      revision: 1,
      runId,
      text: 'Source text for rendering.',
      normalizedText: 'Source text for rendering.',
      textHash: 'hash_1',
      requestText: 'Source text for rendering.',
      inlineTokens: [],
      state: 'translated',
      meta: {
        tagName: 'p',
        carrierTagName: 'p',
        blockType: 'paragraph',
        insertion: 'linebreak-inside',
        depth: 1,
        visible: true,
        textLength: 26,
        rootKind: 'html',
      },
      sourceLang: 'auto',
      targetLang: 'zh-Hans',
      pageUrl: 'https://example.com/page',
      domain: 'example.com',
    })
    bindings.set(createBinding('block_1', carrier))

    const result = coordinator.renderTranslation({
      blockId: 'block_1',
      translatedText: '渲染的译文',
      runId,
      revision: 1,
      textHash: 'hash_1',
      sourceSignature: 'sig_1',
    })

    expect(result.ok).toBe(true)
    expect(store.get('block_1')!.state).toBe('rendered')
    expect(document.querySelector('[data-lingoflow-translation="block_1"]')).not.toBeNull()
    expect(seen).toHaveLength(1)
    expect(bindings.get('block_1')!.insertedNodes.length).toBeGreaterThan(0)
  })

  it('display modes are reversible without provider calls', () => {
    const { coordinator, bindings, store, version } = createCoordinator()
    const carrier = document.createElement('p')
    carrier.textContent = 'Display mode test content.'
    document.body.appendChild(carrier)
    const runId = version.beginRun()
    version.registerBlock('block_1', 'hash_1', 'sig_1')

    store.add({
      id: 'block_1',
      revision: 1,
      runId,
      text: 'Display mode test content.',
      normalizedText: 'Display mode test content.',
      textHash: 'hash_1',
      requestText: 'Display mode test content.',
      inlineTokens: [],
      state: 'translated',
      meta: {
        tagName: 'p',
        carrierTagName: 'p',
        blockType: 'paragraph',
        insertion: 'linebreak-inside',
        depth: 1,
        visible: true,
        textLength: 26,
        rootKind: 'html',
      },
      sourceLang: 'auto',
      targetLang: 'zh-Hans',
      pageUrl: 'https://example.com/page',
      domain: 'example.com',
    })
    bindings.set(createBinding('block_1', carrier))

    coordinator.renderTranslation({
      blockId: 'block_1',
      translatedText: '显示模式测试译文',
      runId,
      revision: 1,
      textHash: 'hash_1',
      sourceSignature: 'sig_1',
    })

    coordinator.setDisplayMode('translation')
    const translation = document.querySelector('[data-lingoflow-translation="block_1"]') as HTMLElement
    const sourceWrapper = carrier.querySelector('[data-lingoflow-source-wrapper]') as HTMLElement
    expect(carrier.hidden).toBe(false)
    expect(sourceWrapper.hidden).toBe(true)
    expect(translation.hidden).toBe(false)
    expect(hasHiddenAncestor(translation)).toBe(false)

    coordinator.setDisplayMode('original')
    expect(carrier.hidden).toBe(false)
    expect(translation.hidden).toBe(true)
    expect(carrier.querySelector('[data-lingoflow-source-wrapper]')).toBeNull()

    coordinator.setDisplayMode('dual')
    expect(carrier.hidden).toBe(false)
    expect(translation.hidden).toBe(false)
  })
})

function createCoordinator() {
  const store = new BlockStore()
  const bindings = new BlockBindingStore()
  const events = new RuntimeEventBus()
  const version = new VersionTracker()
  const registry = StrategyRegistry.withBuiltIns()
  const coordinator = new RenderCoordinator({ store, bindings, events, version, registry })
  return { coordinator, store, bindings, events, version, registry }
}

function hasHiddenAncestor(node: Node): boolean {
  let current = node.parentElement
  while (current) {
    if (current.hidden) return true
    current = current.parentElement
  }
  return false
}
