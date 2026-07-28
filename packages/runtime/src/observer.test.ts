import { PageObserver } from './observer'
import { RuntimeEventBus } from './events'
import { BlockBindingStore } from './bindings'
import { BlockStore } from './store'
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

function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const check = () => {
      if (predicate()) return resolve()
      if (Date.now() - start > timeoutMs) return reject(new Error('Timed out'))
      setTimeout(check, 10)
    }
    check()
  })
}

describe('PageObserver', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
  })

  it('ignores generated LingoFlow mutations', async () => {
    const { observer, events } = createObserver()
    const seen: RuntimeEvent[] = []
    events.on('block:dirty', e => seen.push(e))

    const carrier = document.createElement('p')
    carrier.dataset.lingoflowBlockId = 'block_1'
    carrier.textContent = 'Source text'
    document.body.appendChild(carrier)

    observer.start()

    const translation = document.createElement('div')
    translation.dataset.lingoflowGenerated = 'true'
    translation.textContent = '译文'
    carrier.appendChild(translation)

    await new Promise(r => setTimeout(r, 300))

    expect(seen).toEqual([])
    observer.stop()
  })

  it('marks block dirty on source text mutation', async () => {
    const { observer, bindings, events } = createObserver()
    const seen: RuntimeEvent[] = []
    events.on('block:dirty', e => seen.push(e))

    const carrier = document.createElement('p')
    carrier.dataset.lingoflowBlockId = 'block_1'
    carrier.textContent = 'Original source text'
    document.body.appendChild(carrier)
    bindings.set(createBinding('block_1', carrier))

    observer.start()

    carrier.textContent = 'Mutated source text'

    await waitFor(() => seen.length >= 1)

    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ blockId: 'block_1' })
    observer.stop()
  })

  it('emits observer:newContent after delay when new readable content is added', async () => {
    const { observer, events } = createObserver()
    const seen: RuntimeEvent[] = []
    events.on('observer:newContent', e => seen.push(e))

    observer.start()

    const paragraph = document.createElement('p')
    paragraph.textContent = 'This is a brand new paragraph with enough text to be readable content.'
    document.body.appendChild(paragraph)

    await waitFor(() => seen.length >= 1)

    expect(seen.length).toBeGreaterThanOrEqual(1)
    observer.stop()
  })

  it.each([
    {
      name: 'hidden',
      prepare: (element: HTMLElement) => { element.hidden = true },
      reveal: (element: HTMLElement) => { element.hidden = false },
    },
    {
      name: 'aria-hidden',
      prepare: (element: HTMLElement) => { element.setAttribute('aria-hidden', 'true') },
      reveal: (element: HTMLElement) => { element.setAttribute('aria-hidden', 'false') },
    },
    {
      name: 'class',
      prepare: (element: HTMLElement) => { element.classList.add('collapsed') },
      reveal: (element: HTMLElement) => { element.classList.remove('collapsed') },
    },
    {
      name: 'style',
      prepare: (element: HTMLElement) => { element.style.display = 'none' },
      reveal: (element: HTMLElement) => { element.style.display = 'block' },
    },
  ])('emits one attributes new-content event when $name reveals content', async ({ prepare, reveal }) => {
    const { observer, events } = createObserver()
    const seen: RuntimeEvent[] = []
    events.on('observer:newContent', event => seen.push(event))

    const panel = document.createElement('section')
    prepare(panel)
    panel.innerHTML = '<p>This hidden panel contains enough readable text to translate after it becomes visible.</p>'
    document.body.appendChild(panel)
    observer.start()

    reveal(panel)
    await waitFor(() => seen.length >= 1)

    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ cause: 'attributes' })
    observer.stop()
  })

  it('emits one attributes new-content event when a details element opens', async () => {
    const { observer, events } = createObserver()
    const seen: RuntimeEvent[] = []
    events.on('observer:newContent', event => seen.push(event))

    const details = document.createElement('details')
    details.innerHTML = `
      <summary>Read more</summary>
      <p>This collapsed article content should be considered after the details element opens.</p>
    `
    document.body.appendChild(details)
    observer.start()

    details.open = true
    await waitFor(() => seen.length >= 1)

    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ cause: 'attributes' })
    observer.stop()
  })

  it('debounces a burst of visibility attributes into one new-content event', async () => {
    const { observer, events } = createObserver()
    const seen: RuntimeEvent[] = []
    events.on('observer:newContent', event => seen.push(event))

    const panel = document.createElement('section')
    panel.innerHTML = '<p>This panel has enough readable content for the observer debounce test.</p>'
    document.body.appendChild(panel)
    observer.start()

    panel.hidden = true
    panel.setAttribute('aria-hidden', 'true')
    panel.classList.add('collapsed')
    panel.style.display = 'none'
    panel.setAttribute('open', '')

    await waitFor(() => seen.length >= 1)
    await new Promise(resolve => setTimeout(resolve, 200))

    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ cause: 'attributes' })
    observer.stop()
  })

  it('ignores visibility attribute changes on generated LingoFlow nodes', async () => {
    const { observer, events } = createObserver()
    const seen: RuntimeEvent[] = []
    events.on('observer:newContent', event => seen.push(event))

    const translation = document.createElement('div')
    translation.dataset.lingoflowGenerated = 'true'
    translation.textContent = 'Generated translation content.'
    document.body.appendChild(translation)
    observer.start()

    translation.hidden = true
    translation.classList.add('temporary-state')
    translation.style.display = 'none'

    await new Promise(resolve => setTimeout(resolve, 700))

    expect(seen).toEqual([])
    observer.stop()
  })

  it('emits binding:disconnected when carrier is removed', async () => {
    const { observer, bindings, events } = createObserver()
    const seen: RuntimeEvent[] = []
    events.on('binding:disconnected', e => seen.push(e))

    const carrier = document.createElement('p')
    carrier.dataset.lingoflowBlockId = 'block_1'
    carrier.textContent = 'Carrier text'
    document.body.appendChild(carrier)
    bindings.set(createBinding('block_1', carrier))

    observer.start()

    carrier.remove()

    await waitFor(() => seen.length >= 1)

    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ blockId: 'block_1' })
    observer.stop()
  })

  it('increments root generation on route change', () => {
    const { observer, events } = createObserver()
    const seen: RuntimeEvent[] = []
    events.on('observer:newContent', e => {
      if (e.cause === 'route-change') seen.push(e)
    })

    observer.start()

    history.pushState({}, '', '/new-path')

    expect(seen).toHaveLength(1)
    observer.stop()
  })

  it('stop disconnects observers and cleans up', async () => {
    const { observer, events } = createObserver()
    const seen: RuntimeEvent[] = []
    events.on('block:dirty', e => seen.push(e))

    const carrier = document.createElement('p')
    carrier.dataset.lingoflowBlockId = 'block_1'
    carrier.textContent = 'Text'
    document.body.appendChild(carrier)

    observer.start()
    observer.stop()

    carrier.textContent = 'Changed after stop'

    await new Promise(r => setTimeout(r, 300))

    expect(seen).toEqual([])
  })
})

function createObserver() {
  const events = new RuntimeEventBus()
  const bindings = new BlockBindingStore()
  const store = new BlockStore()
  const observer = new PageObserver({ document, events, bindings, store })
  return { observer, events, bindings, store }
}
