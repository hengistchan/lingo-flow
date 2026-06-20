import { RuntimeEventBus } from './events'
import type { RuntimeEvent } from '@lingoflow/types'

describe('RuntimeEventBus', () => {
  it('delivers subscribed events in order', () => {
    const bus = new RuntimeEventBus()
    const seen: string[] = []
    bus.on('queue:changed', event => seen.push(`${event.queued}:${event.inFlight}`))

    bus.emit({ type: 'queue:changed', queued: 1, inFlight: 0 })
    bus.emit({ type: 'queue:changed', queued: 2, inFlight: 1 })

    expect(seen).toEqual(['1:0', '2:1'])
  })

  it('stops delivery after unsubscribe', () => {
    const bus = new RuntimeEventBus()
    const seen: string[] = []
    const off = bus.on('queue:changed', event => seen.push(`${event.queued}:${event.inFlight}`))

    bus.emit({ type: 'queue:changed', queued: 1, inFlight: 0 })
    off()
    bus.emit({ type: 'queue:changed', queued: 2, inFlight: 0 })

    expect(seen).toEqual(['1:0'])
  })

  it('supports multiple subscribers for the same event type', () => {
    const bus = new RuntimeEventBus()
    const seenA: string[] = []
    const seenB: string[] = []
    bus.on('block:stateChanged', event => seenA.push(event.to))
    bus.on('block:stateChanged', event => seenB.push(event.from))

    bus.emit({ type: 'block:stateChanged', blockId: 'b1', from: 'pending', to: 'queued' })

    expect(seenA).toEqual(['queued'])
    expect(seenB).toEqual(['pending'])
  })

  it('does not deliver events of other types', () => {
    const bus = new RuntimeEventBus()
    const seen: string[] = []
    bus.on('queue:changed', () => seen.push('queue'))

    bus.emit({ type: 'block:stateChanged', blockId: 'b1', from: 'pending', to: 'queued' })

    expect(seen).toEqual([])
  })

  it('removeAll clears all subscriptions', () => {
    const bus = new RuntimeEventBus()
    const seen: string[] = []
    bus.on('queue:changed', () => seen.push('queue'))
    bus.on('block:stateChanged', () => seen.push('block'))

    bus.removeAll()
    bus.emit({ type: 'queue:changed', queued: 1, inFlight: 0 })
    bus.emit({ type: 'block:stateChanged', blockId: 'b1', from: 'pending', to: 'queued' })

    expect(seen).toEqual([])
  })
})
