import type { PageTranslationProgress } from '@lingoflow/types'

export function shouldSuggestPageRule(progress: PageTranslationProgress): boolean {
  return (
    progress.translatedBlocks > 0 &&
    (progress.status === 'done' || progress.status === 'partial')
  )
}

export function isTranslationSessionActive(progress: PageTranslationProgress): boolean {
  return progress.status === 'translating' || progress.status === 'cancelling'
}

export function shouldRetryFailedBlocks(
  progress: PageTranslationProgress,
  selectedTargetLang = progress.targetLang,
): boolean {
  return (
    selectedTargetLang === progress.targetLang &&
    (progress.retryableBlocks ?? 0) > 0 &&
    (progress.status === 'cancelled' ||
      progress.status === 'partial' ||
      progress.status === 'failed')
  )
}
