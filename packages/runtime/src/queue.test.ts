import { BlockQueue } from './queue'

describe('BlockQueue', () => {
  it('enqueues and dequeues block ids', () => {
    const queue = new BlockQueue()

    queue.enqueue('block_1', 100)
    queue.enqueue('block_2', 200)

    const batch = queue.dequeueBatch({ maxItems: 10, maxChars: 10000 })

    expect(batch.blockIds).toEqual(['block_1', 'block_2'])
  })

  it('deduplicates enqueue calls for the same block id', () => {
    const queue = new BlockQueue()

    queue.enqueue('block_1', 100)
    queue.enqueue('block_1', 100)
    queue.enqueue('block_1', 100)

    const batch = queue.dequeueBatch({ maxItems: 10, maxChars: 10000 })

    expect(batch.blockIds).toEqual(['block_1'])
  })

  it('prioritizes viewport blocks over normal blocks', () => {
    const queue = new BlockQueue()

    queue.enqueue('block_normal', 100, 'normal')
    queue.enqueue('block_viewport', 50, 'viewport')
    queue.enqueue('block_normal2', 80, 'normal')

    const batch = queue.dequeueBatch({ maxItems: 10, maxChars: 10000 })

    expect(batch.blockIds[0]).toBe('block_viewport')
  })

  it('respects maxItems batch limit', () => {
    const queue = new BlockQueue()

    queue.enqueue('block_1', 100)
    queue.enqueue('block_2', 200)
    queue.enqueue('block_3', 150)

    const batch = queue.dequeueBatch({ maxItems: 2, maxChars: 10000 })

    expect(batch.blockIds).toHaveLength(2)
  })

  it('respects maxChars batch limit', () => {
    const queue = new BlockQueue()

    queue.enqueue('block_1', 5000)
    queue.enqueue('block_2', 4000)
    queue.enqueue('block_3', 3000)

    const batch = queue.dequeueBatch({ maxItems: 10, maxChars: 10000 })

    expect(batch.blockIds).toHaveLength(2)
    expect(batch.totalChars).toBeLessThanOrEqual(10000)
  })

  it('tracks in-flight requests', () => {
    const queue = new BlockQueue()

    queue.enqueue('block_1', 100)
    queue.enqueue('block_2', 200)

    const batch = queue.dequeueBatch({ maxItems: 10, maxChars: 10000 })
    queue.markInFlight(batch.requestId, batch.blockIds)

    expect(queue.inFlightCount()).toBe(2)
  })

  it('removes in-flight on complete', () => {
    const queue = new BlockQueue()

    queue.enqueue('block_1', 100)
    const batch = queue.dequeueBatch({ maxItems: 10, maxChars: 10000 })
    queue.markInFlight(batch.requestId, batch.blockIds)

    queue.complete(batch.requestId)

    expect(queue.inFlightCount()).toBe(0)
  })

  it('clears queued and in-flight state', () => {
    const queue = new BlockQueue()

    queue.enqueue('block_1', 100)
    queue.enqueue('block_2', 200)
    const batch = queue.dequeueBatch({ maxItems: 10, maxChars: 10000 })
    queue.markInFlight(batch.requestId, batch.blockIds)

    queue.clear()

    expect(queue.queuedCount()).toBe(0)
    expect(queue.inFlightCount()).toBe(0)
  })

  it('reports queued and in-flight counts', () => {
    const queue = new BlockQueue()

    expect(queue.queuedCount()).toBe(0)
    expect(queue.inFlightCount()).toBe(0)

    queue.enqueue('block_1', 100)
    queue.enqueue('block_2', 200)

    expect(queue.queuedCount()).toBe(2)
  })

  it('returns empty batch when queue is empty', () => {
    const queue = new BlockQueue()

    const batch = queue.dequeueBatch({ maxItems: 10, maxChars: 10000 })

    expect(batch.blockIds).toEqual([])
    expect(batch.totalChars).toBe(0)
  })

  it('re-enqueue returns block to queue', () => {
    const queue = new BlockQueue()

    queue.enqueue('block_1', 100)
    const batch = queue.dequeueBatch({ maxItems: 10, maxChars: 10000 })
    queue.markInFlight(batch.requestId, batch.blockIds)
    queue.complete(batch.requestId)

    queue.enqueue('block_1', 100)

    const batch2 = queue.dequeueBatch({ maxItems: 10, maxChars: 10000 })
    expect(batch2.blockIds).toEqual(['block_1'])
  })
})
