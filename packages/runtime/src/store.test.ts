import { BlockStore } from './store'
import type { TranslationBlock } from '@lingoflow/types'

function createBlock(overrides: Partial<TranslationBlock> = {}): TranslationBlock {
  return {
    id: 'block_1',
    revision: 1,
    runId: 'run_1',
    text: 'Original text',
    normalizedText: 'Original text',
    textHash: 'hash_1',
    requestText: 'Original text',
    inlineTokens: [],
    state: 'pending',
    meta: {
      tagName: 'p',
      carrierTagName: 'p',
      blockType: 'paragraph',
      insertion: 'linebreak-inside',
      depth: 1,
      visible: true,
      textLength: 13,
      rootKind: 'html',
    },
    sourceLang: 'auto',
    targetLang: 'zh-Hans',
    pageUrl: 'https://example.com/page',
    domain: 'example.com',
    ...overrides,
  }
}

describe('BlockStore', () => {
  it('adds and retrieves blocks', () => {
    const store = new BlockStore()
    const block = createBlock()

    store.add(block)

    expect(store.get('block_1')).toStrictEqual(block)
    expect(store.size()).toBe(1)
  })

  it('transitions pending -> queued', () => {
    const store = new BlockStore()
    store.add(createBlock())

    const result = store.dispatch('block_1', 'ENQUEUE')

    expect(result).not.toBeNull()
    expect(result!.from).toBe('pending')
    expect(result!.to).toBe('queued')
    expect(store.get('block_1')!.state).toBe('queued')
  })

  it('translates queued -> translating -> translated', () => {
    const store = new BlockStore()
    store.add(createBlock())
    store.dispatch('block_1', 'ENQUEUE')
    store.dispatch('block_1', 'TRANSLATE_START')

    const result = store.dispatch('block_1', 'TRANSLATE_SUCCESS')

    expect(result).not.toBeNull()
    expect(result!.from).toBe('translating')
    expect(result!.to).toBe('translated')
  })

  it('translates translating -> failed on provider failure', () => {
    const store = new BlockStore()
    store.add(createBlock())
    store.dispatch('block_1', 'ENQUEUE')
    store.dispatch('block_1', 'TRANSLATE_START')

    const result = store.dispatch('block_1', 'TRANSLATE_FAIL')

    expect(result).not.toBeNull()
    expect(result!.from).toBe('translating')
    expect(result!.to).toBe('failed')
  })

  it('transitions translated -> rendering -> rendered', () => {
    const store = new BlockStore()
    store.add(createBlock())
    store.dispatch('block_1', 'ENQUEUE')
    store.dispatch('block_1', 'TRANSLATE_START')
    store.dispatch('block_1', 'TRANSLATE_SUCCESS')
    store.dispatch('block_1', 'RENDER_START')

    const result = store.dispatch('block_1', 'RENDER_COMMIT')

    expect(result).not.toBeNull()
    expect(result!.from).toBe('rendering')
    expect(result!.to).toBe('rendered')
  })

  it('transitions rendered -> dirty -> queued on DOM mutation', () => {
    const store = new BlockStore()
    const block = createBlock({ state: 'rendered' })
    store.add(block)

    store.dispatch('block_1', 'DOM_MUTATED')
    expect(store.get('block_1')!.state).toBe('dirty')

    store.dispatch('block_1', 'REQUEUE')
    expect(store.get('block_1')!.state).toBe('queued')
  })

  it('clears block to cancelled from active states', () => {
    const store = new BlockStore()
    store.add(createBlock({ state: 'queued' }))

    const result = store.dispatch('block_1', 'CANCEL')

    expect(result).not.toBeNull()
    expect(result!.to).toBe('cancelled')
  })

  it('clears all blocks', () => {
    const store = new BlockStore()
    store.add(createBlock({ id: 'b1' }))
    store.add(createBlock({ id: 'b2' }))

    store.clear()

    expect(store.size()).toBe(0)
  })

  it('returns null for unknown block dispatch', () => {
    const store = new BlockStore()

    const result = store.dispatch('unknown', 'ENQUEUE')

    expect(result).toBeNull()
  })

  it('returns null for illegal transition', () => {
    const store = new BlockStore()
    store.add(createBlock())

    const result = store.dispatch('block_1', 'RENDER_COMMIT')

    expect(result).toBeNull()
    expect(store.get('block_1')!.state).toBe('pending')
  })

  it('provides all() and ids() iterators', () => {
    const store = new BlockStore()
    store.add(createBlock({ id: 'b1' }))
    store.add(createBlock({ id: 'b2' }))

    expect(store.ids()).toEqual(['b1', 'b2'])
    expect(store.all().length).toBe(2)
  })

  it('removes a specific block', () => {
    const store = new BlockStore()
    store.add(createBlock({ id: 'b1' }))
    store.add(createBlock({ id: 'b2' }))

    store.remove('b1')

    expect(store.size()).toBe(1)
    expect(store.get('b1')).toBeUndefined()
  })
})
