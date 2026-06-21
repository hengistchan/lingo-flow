import type { BlockBinding } from '@lingoflow/types'
import { restoreSourceNodes } from '@lingoflow/renderer'

export class BlockBindingStore {
  private readonly bindings = new Map<string, BlockBinding>()
  private readonly elementIndex = new WeakMap<Node, string>()

  set(binding: BlockBinding): void {
    this.bindings.set(binding.blockId, binding)
    this.elementIndex.set(binding.carrierElement, binding.blockId)
  }

  get(blockId: string): BlockBinding | undefined {
    return this.bindings.get(blockId)
  }

  remove(blockId: string): void {
    const binding = this.bindings.get(blockId)
    if (binding) {
      this.elementIndex.delete(binding.carrierElement)
    }
    this.bindings.delete(blockId)
  }

  size(): number {
    return this.bindings.size
  }

  findByElement(element: Node): BlockBinding | undefined {
    const blockId = this.elementIndex.get(element)
    return blockId ? this.bindings.get(blockId) : undefined
  }

  findByAncestor(node: Node): BlockBinding | undefined {
    let current: Node | null = node
    while (current) {
      const blockId = this.elementIndex.get(current)
      if (blockId) return this.bindings.get(blockId)
      current = current.parentNode
    }
    return undefined
  }

  markRendered(blockId: string, insertedNodes: Node[], hiddenSourceNodes: HTMLElement[]): void {
    const binding = this.bindings.get(blockId)
    if (!binding) return
    binding.insertedNodes = insertedNodes
    binding.hiddenSourceNodes = hiddenSourceNodes
  }

  removeRenderedNodes(blockId: string): void {
    const binding = this.bindings.get(blockId)
    if (!binding) return
    for (const node of binding.insertedNodes) {
      node.parentNode?.removeChild(node)
    }
    binding.insertedNodes = []
  }

  clear(): void {
    for (const binding of this.bindings.values()) {
      for (const node of binding.insertedNodes) {
        node.parentNode?.removeChild(node)
      }
      restoreSourceNodes(binding.hiddenSourceNodes)
      delete binding.carrierElement.dataset.lingoflowBlockId
      binding.carrierElement.removeAttribute('data-lingoflow-block-id')
    }
    this.bindings.clear()
  }

  sweepDisconnected(): string[] {
    const removed: string[] = []
    for (const [blockId, binding] of this.bindings) {
      if (!binding.carrierElement.isConnected) {
        removed.push(blockId)
        this.elementIndex.delete(binding.carrierElement)
        this.bindings.delete(blockId)
      }
    }
    return removed
  }
}
