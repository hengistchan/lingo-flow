import type { RuntimeEvent } from '@lingoflow/types'

type EventHandler<T extends RuntimeEvent> = (event: T) => void

type EventMap = {
  [E in RuntimeEvent as E['type']]: E
}

export class RuntimeEventBus {
  private readonly listeners = new Map<string, Set<EventHandler<any>>>()
  private readonly anyListeners = new Set<EventHandler<RuntimeEvent>>()

  on<T extends RuntimeEvent['type']>(
    type: T,
    handler: EventHandler<EventMap[T]>,
  ): () => void {
    let set = this.listeners.get(type)
    if (!set) {
      set = new Set()
      this.listeners.set(type, set)
    }
    set.add(handler)

    return () => {
      set!.delete(handler)
      if (set!.size === 0) this.listeners.delete(type)
    }
  }

  onAny(handler: EventHandler<RuntimeEvent>): () => void {
    this.anyListeners.add(handler)
    return () => {
      this.anyListeners.delete(handler)
    }
  }

  emit<T extends RuntimeEvent>(event: T): void {
    for (const handler of this.anyListeners) {
      handler(event)
    }
    const set = this.listeners.get(event.type)
    if (!set) return
    for (const handler of set) {
      handler(event)
    }
  }

  removeAll(): void {
    this.listeners.clear()
    this.anyListeners.clear()
  }
}
