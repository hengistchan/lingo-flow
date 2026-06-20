import type { MutationCause, RuntimeEvent } from '@lingoflow/types'
import type { BlockBindingStore } from './bindings'
import type { RuntimeEventBus } from './events'
import type { BlockStore } from './store'

const GENERATED_SELECTORS = [
  '[data-lingoflow-generated]',
  '[data-lingoflow-translation]',
  '[data-lingoflow-translation-break]',
  '[data-lingoflow-translation-spacer]',
  '#lingoflow-style',
]

type PageObserverDeps = {
  document: Document
  events: RuntimeEventBus
  bindings: BlockBindingStore
  store: BlockStore
}

export class PageObserver {
  private readonly doc: Document
  private readonly events: RuntimeEventBus
  private readonly bindings: BlockBindingStore
  private readonly store: BlockStore
  private mutationObserver: MutationObserver | null = null
  private popstateHandler: (() => void) | null = null
  private originalPushState: typeof history.pushState | null = null
  private originalReplaceState: typeof history.replaceState | null = null
  private dirtyTimer: ReturnType<typeof setTimeout> | null = null
  private newContentTimer: ReturnType<typeof setTimeout> | null = null
  private newContentMaxTimer: ReturnType<typeof setTimeout> | null = null
  private pendingDirty = new Set<string>()
  private rootGeneration = 1

  constructor(deps: PageObserverDeps) {
    this.doc = deps.document
    this.events = deps.events
    this.bindings = deps.bindings
    this.store = deps.store
  }

  start(): void {
    this.startMutationObserver()
    this.startRouteChangeObserver()
  }

  stop(): void {
    if (this.mutationObserver) {
      this.mutationObserver.disconnect()
      this.mutationObserver = null
    }

    if (this.popstateHandler) {
      this.doc.defaultView?.removeEventListener('popstate', this.popstateHandler)
      this.popstateHandler = null
    }

    if (this.originalPushState) {
      history.pushState = this.originalPushState
      this.originalPushState = null
    }

    if (this.originalReplaceState) {
      history.replaceState = this.originalReplaceState
      this.originalReplaceState = null
    }

    if (this.dirtyTimer) {
      clearTimeout(this.dirtyTimer)
      this.dirtyTimer = null
    }

    if (this.newContentTimer) {
      clearTimeout(this.newContentTimer)
      this.newContentTimer = null
    }

    if (this.newContentMaxTimer) {
      clearTimeout(this.newContentMaxTimer)
      this.newContentMaxTimer = null
    }

    this.pendingDirty.clear()
  }

  private startMutationObserver(): void {
    this.mutationObserver = new MutationObserver(mutations => {
      const dirtyBlockIds = new Set<string>()
      let hasNewContent = false

      for (const mutation of mutations) {
        if (this.isGeneratedMutation(mutation)) continue

        if (mutation.type === 'characterData') {
          const blockId = this.findBlockIdForNode(mutation.target)
          if (blockId) dirtyBlockIds.add(blockId)
        }

        if (mutation.type === 'childList') {
          const target = mutation.target
          if (target instanceof HTMLElement && target.dataset.lingoflowBlockId) {
            dirtyBlockIds.add(target.dataset.lingoflowBlockId)
          }

          for (const node of mutation.removedNodes) {
            if (node instanceof HTMLElement) {
              const blockId = node.dataset?.lingoflowBlockId
              if (blockId) {
                this.events.emit({ type: 'binding:disconnected', blockId, revision: 0 })
              }
            }
          }

          for (const node of mutation.addedNodes) {
            if (node instanceof HTMLElement && !this.isGeneratedNode(node)) {
              hasNewContent = true
            }
          }
        }
      }

      if (dirtyBlockIds.size > 0) {
        this.scheduleDirty([...dirtyBlockIds])
      }

      if (hasNewContent) {
        this.scheduleNewContent()
      }
    })

    this.mutationObserver.observe(this.doc.body, {
      childList: true,
      characterData: true,
      subtree: true,
    })
  }

  private startRouteChangeObserver(): void {
    this.originalPushState = history.pushState
    this.originalReplaceState = history.replaceState

    const self = this
    history.pushState = function (...args: Parameters<typeof history.pushState>) {
      self.originalPushState!.apply(history, args)
      self.onRouteChange()
    }

    history.replaceState = function (...args: Parameters<typeof history.replaceState>) {
      self.originalReplaceState!.apply(history, args)
      self.onRouteChange()
    }

    this.popstateHandler = () => this.onRouteChange()
    this.doc.defaultView?.addEventListener('popstate', this.popstateHandler)
  }

  private onRouteChange(): void {
    this.rootGeneration++
    this.events.emit({
      type: 'observer:newContent',
      cause: 'route-change',
      rootKind: 'html',
      rootGeneration: this.rootGeneration,
      rootId: `root_${this.rootGeneration}`,
    })
  }

  private scheduleDirty(blockIds: string[]): void {
    for (const id of blockIds) this.pendingDirty.add(id)

    if (this.dirtyTimer) return

    this.dirtyTimer = setTimeout(() => {
      const current = [...this.pendingDirty]
      this.pendingDirty.clear()
      this.dirtyTimer = null

      for (const blockId of current) {
        this.events.emit({
          type: 'block:dirty',
          blockId,
          revision: this.bindings.get(blockId)?.revision ?? 0,
          cause: 'character-data',
        })
      }
    }, 80)
  }

  private scheduleNewContent(): void {
    if (this.newContentMaxTimer === null) {
      this.newContentMaxTimer = setTimeout(() => {
        this.newContentMaxTimer = null
        this.flushNewContent()
      }, 1000)
    }

    if (this.newContentTimer) return

    this.newContentTimer = setTimeout(() => {
      this.newContentTimer = null
      this.flushNewContent()
    }, 500)
  }

  private flushNewContent(): void {
    if (this.newContentTimer) {
      clearTimeout(this.newContentTimer)
      this.newContentTimer = null
    }
    if (this.newContentMaxTimer) {
      clearTimeout(this.newContentMaxTimer)
      this.newContentMaxTimer = null
    }
    this.events.emit({
      type: 'observer:newContent',
      cause: 'child-list',
      rootKind: 'html',
      rootGeneration: this.rootGeneration,
      rootId: `root_${this.rootGeneration}`,
    })
  }

  private isGeneratedMutation(mutation: MutationRecord): boolean {
    const target = mutation.target
    if (target instanceof HTMLElement) {
      if (this.isGeneratedNode(target)) return true
      if (target.closest(GENERATED_SELECTORS.join(','))) return true
    }

    if (mutation.type === 'childList') {
      const addedHtml = Array.from(mutation.addedNodes).filter(
        (n): n is HTMLElement => n instanceof HTMLElement,
      )
      if (addedHtml.length > 0 && addedHtml.every(n => this.isGeneratedNode(n))) return true

      const removedHtml = Array.from(mutation.removedNodes).filter(
        (n): n is HTMLElement => n instanceof HTMLElement,
      )
      if (removedHtml.length > 0 && removedHtml.every(n => this.isGeneratedNode(n))) return true
    }

    return false
  }

  private isGeneratedNode(node: HTMLElement): boolean {
    return !!(
      node.dataset.lingoflowGenerated ||
      node.dataset.lingoflowTranslation ||
      node.dataset.lingoflowTranslationBreak ||
      node.dataset.lingoflowTranslationSpacer ||
      node.id === 'lingoflow-style'
    )
  }

  private findBlockIdForNode(node: Node): string | null {
    let current: Node | null = node
    while (current && current !== this.doc.body) {
      if (current instanceof HTMLElement && current.dataset.lingoflowBlockId) {
        return current.dataset.lingoflowBlockId
      }
      current = current.parentNode
    }
    return null
  }
}
