import { TranslationSessionRegistry } from './translation-session-registry'

describe('TranslationSessionRegistry', () => {
  it('shares one abort signal across concurrent batches in the same tab session', async () => {
    const registry = new TranslationSessionRegistry()
    const signals: AbortSignal[] = []
    let release = () => {}
    const gate = new Promise<void>(resolve => {
      release = resolve
    })

    const first = registry.run(7, 'session-a', async signal => {
      signals.push(signal!)
      await gate
      return 'first'
    })
    const second = registry.run(7, 'session-a', async signal => {
      signals.push(signal!)
      await gate
      return 'second'
    })

    await vi.waitFor(() => expect(signals).toHaveLength(2))
    expect(signals[0]).toBe(signals[1])

    release()
    await expect(Promise.all([first, second])).resolves.toEqual(['first', 'second'])
  })

  it('aborts active work and rejects a batch that arrives after cancellation', async () => {
    const registry = new TranslationSessionRegistry()
    const providerCall = vi.fn()
    const active = registry.run(7, 'session-a', signal => new Promise<string>((_resolve, reject) => {
      providerCall()
      signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
    }))

    await vi.waitFor(() => expect(providerCall).toHaveBeenCalledTimes(1))
    expect(registry.cancel(7, 'session-a')).toEqual({ abortedActiveBatches: true })

    await expect(active).rejects.toMatchObject({
      code: 'translation_session_cancelled',
    })

    const lateProviderCall = vi.fn()
    await expect(registry.run(7, 'session-a', async () => {
      lateProviderCall()
      return 'late'
    })).rejects.toMatchObject({
      code: 'translation_session_cancelled',
    })
    expect(lateProviderCall).not.toHaveBeenCalled()
  })

  it('isolates identical session IDs between tabs', async () => {
    const registry = new TranslationSessionRegistry()
    registry.cancel(7, 'shared-session-id')
    const otherTabProviderCall = vi.fn().mockResolvedValue('translated')

    await expect(registry.run(8, 'shared-session-id', otherTabProviderCall))
      .resolves.toBe('translated')
    expect(otherTabProviderCall).toHaveBeenCalledTimes(1)
  })
})
