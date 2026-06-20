import type { BlockState, TranslationBlock } from '@lingoflow/types'

type BlockEvent =
  | 'ENQUEUE'
  | 'TRANSLATE_START'
  | 'TRANSLATE_SUCCESS'
  | 'TRANSLATE_FAIL'
  | 'RENDER_START'
  | 'RENDER_COMMIT'
  | 'RENDER_SKIP'
  | 'DOM_MUTATED'
  | 'REQUEUE'
  | 'MARK_STALE'
  | 'CLEAR'
  | 'CANCEL'

type Transition = {
  from: BlockState
  to: BlockState
}

const TRANSITIONS: Record<BlockEvent, Transition[]> = {
  ENQUEUE: [{ from: 'pending', to: 'queued' }, { from: 'dirty', to: 'queued' }],
  TRANSLATE_START: [{ from: 'queued', to: 'translating' }],
  TRANSLATE_SUCCESS: [{ from: 'translating', to: 'translated' }],
  TRANSLATE_FAIL: [{ from: 'translating', to: 'failed' }],
  RENDER_START: [{ from: 'translated', to: 'rendering' }],
  RENDER_COMMIT: [{ from: 'rendering', to: 'rendered' }],
  RENDER_SKIP: [{ from: 'rendering', to: 'translated' }],
  DOM_MUTATED: [{ from: 'rendered', to: 'dirty' }],
  REQUEUE: [{ from: 'dirty', to: 'queued' }, { from: 'failed', to: 'queued' }],
  MARK_STALE: [{ from: 'rendered', to: 'stale' }, { from: 'translated', to: 'stale' }],
  CLEAR: [
    { from: 'pending', to: 'cancelled' },
    { from: 'queued', to: 'cancelled' },
    { from: 'translating', to: 'cancelled' },
    { from: 'translated', to: 'cancelled' },
    { from: 'rendering', to: 'cancelled' },
  ],
  CANCEL: [
    { from: 'pending', to: 'cancelled' },
    { from: 'queued', to: 'cancelled' },
    { from: 'translating', to: 'cancelled' },
  ],
}

export type DispatchResult = {
  from: BlockState
  to: BlockState
  block: TranslationBlock
}

export class BlockStore {
  private readonly blocks = new Map<string, TranslationBlock>()

  add(block: TranslationBlock): void {
    this.blocks.set(block.id, { ...block })
  }

  get(blockId: string): TranslationBlock | undefined {
    return this.blocks.get(blockId)
  }

  remove(blockId: string): void {
    this.blocks.delete(blockId)
  }

  size(): number {
    return this.blocks.size
  }

  all(): TranslationBlock[] {
    return Array.from(this.blocks.values())
  }

  ids(): string[] {
    return Array.from(this.blocks.keys())
  }

  clear(): void {
    this.blocks.clear()
  }

  dispatch(blockId: string, event: BlockEvent): DispatchResult | null {
    const block = this.blocks.get(blockId)
    if (!block) return null

    const transitions = TRANSITIONS[event]
    const valid = transitions.find(t => t.from === block.state)
    if (!valid) return null

    const from = block.state
    block.state = valid.to
    return { from, to: valid.to, block: { ...block } }
  }
}
