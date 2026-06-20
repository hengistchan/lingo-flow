import { createBatches, retry, translateBatchWithDegrade } from './index'
import type { TranslationTask } from '@lingoflow/types'

const task = (id: string): TranslationTask => ({
  id,
  blockId: `block_${id}`,
  sourceText: `Source text ${id}`,
  normalizedText: `Source text ${id}`,
  textHash: id,
  sourceLang: 'en',
  targetLang: 'zh-Hans',
  providerId: 'azure-translator',
  cacheKey: `translation:${id}:en:zh-Hans:azure-translator:default:none:v1`,
  pageUrl: 'https://example.com/article',
  domain: 'example.com',
})

describe('scheduler', () => {
  it('creates batches by item count and character limit', () => {
    const batches = createBatches([task('1'), task('2'), task('3')], {
      maxItems: 2,
      maxChars: 26,
    })

    expect(batches.map(batch => batch.map(item => item.id))).toEqual([['1', '2'], ['3']])
  })

  it('retries retryable failures and stops after success', async () => {
    let attempts = 0

    const result = await retry(
      async () => {
        attempts += 1
        if (attempts < 3) {
          const error = new Error('rate limited') as Error & { status?: number }
          error.status = 429
          throw error
        }
        return 'ok'
      },
      { attempts: 3, delayMs: 0 },
    )

    expect(result).toBe('ok')
    expect(attempts).toBe(3)
  })

  it('Uses exponential backoff delays between retries', async () => {
    vi.useFakeTimers()

    const realSetTimeout = globalThis.setTimeout.bind(globalThis)
    const calls: number[] = []
    globalThis.setTimeout = ((fn: TimerHandler, ms?: number, ...args: unknown[]) => {
      calls.push(ms ?? 0)
      return realSetTimeout(fn, ms ?? 0, ...args)
    }) as typeof globalThis.setTimeout

    let attempts = 0
    const resultPromise = retry(
      async () => {
        attempts += 1
        if (attempts < 4) {
          const error = new Error('rate limited') as Error & { status?: number }
          error.status = 429
          throw error
        }
        return 'ok'
      },
      { attempts: 4, delayMs: 100 },
    )

    await vi.advanceTimersByTimeAsync(800)

    const result = await resultPromise

    expect(result).toBe('ok')
    expect(calls).toEqual([100, 200, 400])

    vi.useRealTimers()
  })

  it('splits failed batches and marks single task failure while continuing', async () => {
    const tasks = [task('1'), task('2'), task('3')]

    const results = await translateBatchWithDegrade(tasks, async batch => {
      if (batch.length > 1) throw new Error('batch too large')
      if (batch[0].id === '2') throw new Error('single failed')
      return [
        {
          taskId: batch[0].id,
          blockId: batch[0].blockId,
          sourceText: batch[0].sourceText,
          translatedText: `Translated ${batch[0].id}`,
          sourceLang: 'en',
          targetLang: 'zh-Hans',
          providerId: 'azure-translator',
          cacheKey: batch[0].cacheKey,
          fromCache: false,
          status: 'success',
        },
      ]
    })

    expect(results.map(result => result.status)).toEqual(['success', 'failed', 'success'])
  })
})
