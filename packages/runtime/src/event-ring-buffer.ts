import type { RuntimeEvent } from '@lingoflow/types'

const DEFAULT_MAX_EVENTS = 500

export class EventRingBuffer {
  private readonly buffer: RuntimeEvent[] = []
  private readonly maxEvents: number

  constructor(maxEvents = DEFAULT_MAX_EVENTS) {
    this.maxEvents = maxEvents
  }

  push(event: RuntimeEvent): void {
    if (this.buffer.length >= this.maxEvents) {
      this.buffer.shift()
    }
    this.buffer.push(event)
  }

  getAll(): RuntimeEvent[] {
    return [...this.buffer]
  }

  getRecent(maxEvents: number): RuntimeEvent[] {
    if (maxEvents >= this.buffer.length) return [...this.buffer]
    return this.buffer.slice(this.buffer.length - maxEvents)
  }

  clear(): void {
    this.buffer.length = 0
  }

  size(): number {
    return this.buffer.length
  }
}
