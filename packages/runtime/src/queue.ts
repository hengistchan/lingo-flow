import type { QueuePriority } from '@lingoflow/types'

type QueueEntry = {
  blockId: string
  chars: number
  priority: QueuePriority
}

type BatchLimits = {
  maxItems: number
  maxChars: number
}

type DequeuedBatch = {
  requestId: string
  blockIds: string[]
  totalChars: number
}

export class BlockQueue {
  private readonly queue: QueueEntry[] = []
  private readonly enqueued = new Set<string>()
  private readonly inFlight = new Map<string, Set<string>>()
  private nextRequestId = 1

  enqueue(blockId: string, chars: number, priority: QueuePriority = 'normal'): void {
    if (this.enqueued.has(blockId)) return
    this.enqueued.add(blockId)
    this.queue.push({ blockId, chars, priority })
    this.sortQueue()
  }

  dequeueBatch(limits: BatchLimits): DequeuedBatch {
    const blockIds: string[] = []
    let totalChars = 0

    while (this.queue.length > 0 && blockIds.length < limits.maxItems) {
      const entry = this.queue[0]
      if (totalChars + entry.chars > limits.maxChars && blockIds.length > 0) break
      this.queue.shift()
      this.enqueued.delete(entry.blockId)
      blockIds.push(entry.blockId)
      totalChars += entry.chars
    }

    const requestId = `req_${this.nextRequestId++}`
    return { requestId, blockIds, totalChars }
  }

  markInFlight(requestId: string, blockIds: string[]): void {
    this.inFlight.set(requestId, new Set(blockIds))
  }

  complete(requestId: string): void {
    this.inFlight.delete(requestId)
  }

  queuedCount(): number {
    return this.queue.length
  }

  inFlightCount(): number {
    let count = 0
    for (const set of this.inFlight.values()) count += set.size
    return count
  }

  clear(): void {
    this.queue.length = 0
    this.enqueued.clear()
    this.inFlight.clear()
  }

  private sortQueue(): void {
    const priorityOrder: Record<QueuePriority, number> = {
      viewport: 0,
      normal: 1,
      background: 2,
    }
    this.queue.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
  }
}
