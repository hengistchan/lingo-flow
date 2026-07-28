import { shouldSuggestPageRule } from './popup-state'
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
