import type {
  BlockBinding,
  InsertionResult,
  PageDisplayMode,
  RenderSkipReason,
  RuntimeEvent,
} from '@lingoflow/types'
import { defaultStrategyRegistry, hideSourceNodes, restoreSourceNodes, type StrategyRegistry } from '@lingoflow/renderer'
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
}

export class RenderCoordinator {
  private readonly store: BlockStore
  private readonly bindings: BlockBindingStore
  private readonly events: RuntimeEventBus
  private readonly version: VersionTracker
  private readonly registry: StrategyRegistry
  private displayMode: PageDisplayMode = 'dual'

  constructor(deps: RenderCoordinatorDeps) {
    this.store = deps.store
    this.bindings = deps.bindings
    this.events = deps.events
    this.version = deps.version
    this.registry = deps.registry ?? defaultStrategyRegistry
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
        hideSourceNodes([binding.carrierElement])
        translation.hidden = false
      } else if (mode === 'original') {
        restoreSourceNodes([binding.carrierElement])
        translation.hidden = true
      } else {
        restoreSourceNodes([binding.carrierElement])
        translation.hidden = false
      }
    }

    this.events.emit({ type: 'page:displayModeChanged', from: previous, to: mode })
  }

  private skip(blockId: string, reason: RenderSkipReason): RenderResult {
    const block = this.store.get(blockId)
    this.events.emit({
      type: 'render:skipped',
      blockId,
      revision: block?.revision ?? 0,
      reason,
    })
    return { ok: false, reason }
  }
}
