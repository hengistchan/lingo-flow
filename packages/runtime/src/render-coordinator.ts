import type {
  BlockBinding,
  InsertionResult,
  PageDisplayMode,
  RenderSkipReason,
  RuntimeEvent,
} from '@lingoflow/types'
import { defaultStrategyRegistry, hideSourceNodes, injectLingoFlowStyles, restoreSourceNodes, type StrategyRegistry } from '@lingoflow/renderer'
import type { BlockBindingStore } from './bindings'
import type { RuntimeEventBus } from './events'
import type { BlockStore } from './store'
import type { VersionTracker } from './version'

export type RenderInput = {
  blockId: string
  translatedText: string
  runId: string
  revision: number
  textHash: string
  sourceSignature: string
}

export type RenderResult =
  | { ok: true; result: InsertionResult }
  | { ok: false; reason: RenderSkipReason }

type RenderCoordinatorDeps = {
  store: BlockStore
  bindings: BlockBindingStore
  events: RuntimeEventBus
  version: VersionTracker
  registry?: StrategyRegistry
  document?: Document
}

export class RenderCoordinator {
  private readonly store: BlockStore
  private readonly bindings: BlockBindingStore
  private readonly events: RuntimeEventBus
  private readonly version: VersionTracker
  private readonly registry: StrategyRegistry
  private displayMode: PageDisplayMode = 'dual'
  private renderSkipCount = 0

  constructor(deps: RenderCoordinatorDeps) {
    this.store = deps.store
    this.bindings = deps.bindings
    this.events = deps.events
    this.version = deps.version
    this.registry = deps.registry ?? defaultStrategyRegistry
    injectLingoFlowStyles(deps.document)
  }

  getRenderSkipCount(): number {
    return this.renderSkipCount
  }

  resetRenderSkipCount(): void {
    this.renderSkipCount = 0
  }

  getDisplayMode(): PageDisplayMode {
    return this.displayMode
  }

  renderTranslation(input: RenderInput): RenderResult {
    const binding = this.bindings.get(input.blockId)
    if (!binding) {
      return this.skip(input.blockId, 'missing-binding')
    }

    if (!binding.carrierElement.isConnected) {
      return this.skip(input.blockId, 'detached')
    }

    const block = this.store.get(input.blockId)
    if (!block) {
      return this.skip(input.blockId, 'missing-binding')
    }

    const staleness = this.version.checkStaleness(input.blockId, {
      runId: input.runId,
      revision: input.revision,
      textHash: input.textHash,
      sourceSignature: input.sourceSignature,
    })
    if (!staleness.ok) {
      return this.skip(input.blockId, 'stale')
    }

    if (block.text === input.translatedText) {
      return this.skip(input.blockId, 'same-text')
    }

    if (binding.loadingElement || binding.errorElement) {
      this.bindings.removeRenderedNodes(input.blockId)
    }

    const existingTranslation = binding.carrierElement.ownerDocument.querySelector(
      `[data-lingoflow-translation="${input.blockId}"]`,
    )
    if (existingTranslation) {
      return this.skip(input.blockId, 'duplicate')
    }

    this.store.dispatch(input.blockId, 'RENDER_START')

    const strategy = this.registry.resolve(
      { ...block, translatedText: input.translatedText },
      binding,
      this.displayMode,
    )

    if (!strategy) {
      this.store.dispatch(input.blockId, 'RENDER_SKIP')
      return this.skip(input.blockId, 'unsupported-strategy')
    }

    const plan = strategy.plan(
      { ...block, translatedText: input.translatedText },
      binding,
      this.displayMode,
    )
    const result = strategy.apply(plan)

    this.bindings.markRendered(input.blockId, result.insertedNodes, result.hiddenSourceNodes)
    this.store.dispatch(input.blockId, 'RENDER_COMMIT')

    this.events.emit({
      type: 'render:committed',
      blockId: input.blockId,
      revision: block.revision,
      nodeCount: result.insertedNodes.length,
    })

    return { ok: true, result }
  }

  renderLoading(blockId: string): RenderResult {
    return this.renderPlaceholder(blockId, 'loading')
  }

  renderError(blockId: string, message: string): RenderResult {
    return this.renderPlaceholder(blockId, 'error', message)
  }

  setDisplayMode(mode: PageDisplayMode): void {
    const previous = this.displayMode
    this.displayMode = mode

    for (const block of this.store.all()) {
      if (block.state !== 'rendered') continue
      const binding = this.bindings.get(block.id)
      if (!binding) continue

      const doc = binding.carrierElement.ownerDocument
      const translation = doc.querySelector(`[data-lingoflow-translation="${block.id}"]`) as HTMLElement | null
      if (!translation) continue

      if (mode === 'translation') {
        binding.hiddenSourceNodes = hideSourceNodes([binding.carrierElement])
        translation.hidden = false
      } else if (mode === 'original') {
        restoreSourceNodes(binding.hiddenSourceNodes.length > 0 ? binding.hiddenSourceNodes : [binding.carrierElement])
        binding.hiddenSourceNodes = []
        translation.hidden = true
      } else {
        restoreSourceNodes(binding.hiddenSourceNodes.length > 0 ? binding.hiddenSourceNodes : [binding.carrierElement])
        binding.hiddenSourceNodes = []
        translation.hidden = false
      }
    }

    this.events.emit({ type: 'page:displayModeChanged', from: previous, to: mode })
  }

  private skip(blockId: string, reason: RenderSkipReason): RenderResult {
    this.renderSkipCount++
    const block = this.store.get(blockId)
    this.events.emit({
      type: 'render:skipped',
      blockId,
      revision: block?.revision ?? 0,
      reason,
    })
    return { ok: false, reason }
  }

  private renderPlaceholder(
    blockId: string,
    kind: 'loading' | 'error',
    message?: string,
  ): RenderResult {
    const binding = this.bindings.get(blockId)
    if (!binding) return this.skip(blockId, 'missing-binding')
    if (!binding.carrierElement.isConnected) return this.skip(blockId, 'detached')

    const block = this.store.get(blockId)
    if (!block) return this.skip(blockId, 'missing-binding')

    this.bindings.removeRenderedNodes(blockId)

    const placeholderText = kind === 'loading' ? ' ' : (message ?? '')
    const strategy = this.registry.resolve(
      { ...block, translatedText: placeholderText },
      binding,
      this.displayMode,
    )
    if (!strategy) return this.skip(blockId, 'unsupported-strategy')

    const plan = strategy.plan(
      { ...block, translatedText: placeholderText },
      binding,
      this.displayMode,
    )
    const result = strategy.apply(plan)
    const placeholder = findPrimaryInsertedElement(result.insertedNodes)
    if (placeholder) {
      delete placeholder.dataset.lingoflowTranslation
      placeholder.removeAttribute('data-lingoflow-translation')
      placeholder.classList.add(kind === 'loading' ? 'lingoflow-loading' : 'lingoflow-error')
      if (kind === 'loading') {
        placeholder.dataset.lingoflowLoading = blockId
        const inner = placeholder.querySelector('.lingoflow-translation-inner')
        if (inner) {
          const doc = placeholder.ownerDocument
          inner.textContent = ''
          for (let i = 0; i < 3; i++) {
            const dot = doc.createElement('span')
            dot.className = 'lingoflow-dot'
            inner.appendChild(dot)
          }
        }
      } else {
        placeholder.dataset.lingoflowError = blockId
      }
    }

    this.bindings.markRendered(blockId, result.insertedNodes, result.hiddenSourceNodes)
    const updated = this.bindings.get(blockId)
    if (updated && placeholder) {
      if (kind === 'loading') {
        updated.loadingElement = placeholder
        updated.errorElement = null
      } else {
        updated.errorElement = placeholder
        updated.loadingElement = null
      }
    }

    return { ok: true, result }
  }
}

function findPrimaryInsertedElement(nodes: Node[]): HTMLElement | null {
  return nodes.find((node): node is HTMLElement =>
    node instanceof HTMLElement && node.classList.contains('lingoflow-translation-wrapper')
  ) ?? null
}
