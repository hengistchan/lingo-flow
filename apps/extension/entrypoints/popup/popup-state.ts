import type { PageTranslationProgress } from '@lingoflow/types'

export function shouldSuggestPageRule(progress: PageTranslationProgress): boolean {
  return (
    progress.translatedBlocks > 0 &&
    (progress.status === 'done' || progress.status === 'partial')
  )
}
