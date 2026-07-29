import {
  isTranslationSessionActive,
  shouldRetryFailedBlocks,
  shouldSuggestPageRule,
} from './popup-state'
import type { PageTranslationProgress } from '@lingoflow/types'

function progress(
  status: PageTranslationProgress['status'],
  translatedBlocks: number,
): PageTranslationProgress {
  return {
    status,
    sourceLang: 'auto',
    targetLang: 'zh-Hans',
    totalBlocks: 3,
    translatedBlocks,
    cacheHits: 0,
    failedBlocks: 0,
  }
}

describe('popup page-rule suggestion', () => {
  it.each([
    ['done', 3],
    ['partial', 2],
  ] as const)('appears only after a useful %s translation', (status, translated) => {
    expect(shouldSuggestPageRule(progress(status, translated))).toBe(true)
  })

  it.each([
    ['idle', 0],
    ['translating', 1],
    ['failed', 0],
    ['done', 0],
  ] as const)('stays hidden for %s with %s translated blocks', (status, translated) => {
    expect(shouldSuggestPageRule(progress(status, translated))).toBe(false)
  })
})

describe('popup translation session actions', () => {
  it.each(['translating', 'cancelling'] as const)(
    'keeps the stop control active while status is %s',
    status => {
      expect(isTranslationSessionActive(progress(status, 1))).toBe(true)
    },
  )

  it.each(['cancelled', 'partial', 'failed'] as const)(
    'offers failed-item retry for %s when retryable work remains',
    status => {
      expect(shouldRetryFailedBlocks({
        ...progress(status, 1),
        retryableBlocks: 2,
      })).toBe(true)
    },
  )

  it('does not offer retry after a complete session', () => {
    expect(shouldRetryFailedBlocks({
      ...progress('done', 3),
      retryableBlocks: 0,
    })).toBe(false)
  })

  it('starts a fresh translation instead of retrying an old target language', () => {
    expect(shouldRetryFailedBlocks({
      ...progress('partial', 1),
      targetLang: 'ja',
      retryableBlocks: 2,
    }, 'fr')).toBe(false)
  })
})
