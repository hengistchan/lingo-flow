import { BlockBindingStore } from './bindings'
import type { BlockBinding } from '@lingoflow/types'

function createBinding(overrides: Partial<BlockBinding> = {}): BlockBinding {
  const carrier = document.createElement('p')
  carrier.textContent = 'Test content'
  document.body.appendChild(carrier)
  return {
    blockId: 'block_1',
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
    ...overrides,
  }
}

describe('BlockBindingStore', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('sets and gets bindings', () => {
    const store = new BlockBindingStore()
    const binding = createBinding()

    store.set(binding)

    expect(store.get('block_1')).toBe(binding)
    expect(store.size()).toBe(1)
  })

  it('removes bindings', () => {
    const store = new BlockBindingStore()
    store.set(createBinding())

    store.remove('block_1')

    expect(store.get('block_1')).toBeUndefined()
    expect(store.size()).toBe(0)
  })

  it('finds binding by carrier element', () => {
    const store = new BlockBindingStore()
    const binding = createBinding()
    store.set(binding)

    const found = store.findByElement(binding.carrierElement)

    expect(found).toBe(binding)
  })

  it('finds binding by ancestor element', () => {
    const store = new BlockBindingStore()
    const child = document.createElement('span')
    child.textContent = 'child'
    const binding = createBinding()
    binding.carrierElement.appendChild(child)
    store.set(binding)

    const found = store.findByAncestor(child)

    expect(found).toBe(binding)
  })

  it('returns undefined for unknown element', () => {
    const store = new BlockBindingStore()
    const unknown = document.createElement('div')

    expect(store.findByElement(unknown)).toBeUndefined()
    expect(store.findByAncestor(unknown)).toBeUndefined()
  })

  it('marks rendered and tracks inserted nodes', () => {
    const store = new BlockBindingStore()
    const binding = createBinding()
    store.set(binding)

    const inserted = [document.createElement('div')]
    const hidden = [binding.carrierElement]
    store.markRendered('block_1', inserted, hidden)

    const updated = store.get('block_1')!
    expect(updated.insertedNodes).toEqual(inserted)
    expect(updated.hiddenSourceNodes).toEqual(hidden)
  })

  it('removes rendered nodes from DOM', () => {
    const store = new BlockBindingStore()
    const translation = document.createElement('div')
    document.body.appendChild(translation)
    const binding = createBinding({ insertedNodes: [translation] })
    store.set(binding)

    store.removeRenderedNodes('block_1')

    expect(translation.parentNode).toBeNull()
    expect(store.get('block_1')!.insertedNodes).toEqual([])
  })

  it('clears all bindings and removes generated nodes', () => {
    const store = new BlockBindingStore()
    const carrier = document.createElement('p')
    carrier.dataset.lingoflowBlockId = 'block_1'
    document.body.appendChild(carrier)
    const translation = document.createElement('div')
    translation.dataset.lingoflowTranslation = 'block_1'
    document.body.appendChild(translation)

    store.set(createBinding({
      carrierElement: carrier,
      insertedNodes: [translation],
      hiddenSourceNodes: [carrier],
    }))

    store.clear()

    expect(store.size()).toBe(0)
    expect(translation.parentNode).toBeNull()
    expect(carrier.dataset.lingoflowBlockId).toBeUndefined()
    expect(carrier.hidden).toBe(false)
  })

  it('sweeps disconnected carriers', () => {
    const store = new BlockBindingStore()
    const carrier = document.createElement('p')
    document.body.appendChild(carrier)
    store.set(createBinding({ carrierElement: carrier }))

    carrier.remove()

    const swept = store.sweepDisconnected()

    expect(swept).toEqual(['block_1'])
    expect(store.get('block_1')).toBeUndefined()
  })

  it('returns empty array when no disconnected carriers', () => {
    const store = new BlockBindingStore()
    store.set(createBinding())

    const swept = store.sweepDisconnected()

    expect(swept).toEqual([])
  })
})
