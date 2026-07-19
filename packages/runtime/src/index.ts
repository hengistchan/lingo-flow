import type {
  MessageResponse,
  PageTranslationProgress,
  TranslationResult,
  TranslationTask,
} from '@lingoflow/types'
import { RuntimeController, type ControllerDependencies, type PageTranslationOverrides } from './controller'

export { RuntimeController } from './controller'
export type { ControllerDependencies, PageTranslationOverrides } from './controller'
export { BlockStore } from './store'
export { BlockBindingStore } from './bindings'
export { RuntimeEventBus } from './events'
export { EventRingBuffer } from './event-ring-buffer'
export { VersionTracker } from './version'
export { BlockQueue } from './queue'
export { RenderCoordinator } from './render-coordinator'
export { PageObserver } from './observer'
export {
  HoverTranslationController,
  isHoverTranslationShortcut,
  resolveHoveredText,
  resolveTextAtPoint,
  segmentSentenceAtOffset,
} from './hover-translation'

export function createContentRuntime(dependencies: ControllerDependencies = {}) {
  const controller = new RuntimeController(dependencies)
  return {
    start: () => controller.start(),
    stop: () => controller.stop(),
    translatePage: (overrides?: PageTranslationOverrides) => controller.translatePage(overrides),
    translateIncremental: (overrides?: PageTranslationOverrides) => controller.translateIncremental(overrides),
    enableDynamicTranslation: () => controller.enableDynamicTranslation(),
    disableDynamicTranslation: () => controller.disableDynamicTranslation(),
    getProgress: () => controller.getProgress(),
    getDiagnostics: (options?: { includeBlocks?: boolean; includeEvents?: boolean; maxEvents?: number }) => controller.getDiagnostics(options),
    runDryDiagnostics: (payload?: { ruleOverride?: import('@lingoflow/types').PageRule; includeSkipped?: boolean }) => controller.runDryDiagnostics(payload),
    clearPage: () => controller.clearPage(),
  }
}

export function evictOldestCacheEntries(cache: Map<string, TranslationResult>, maxEntries: number) {
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value
    if (oldestKey !== undefined) cache.delete(oldestKey)
  }
}

export function deriveProgressStatus(input: {
  translated: number
  failed: number
  total: number
}): PageTranslationProgress['status'] {
  if (input.total <= 0) return 'failed'
  if (input.translated === 0) return 'failed'
  if (input.failed > 0 || input.translated < input.total) return 'partial'
  return 'done'
}
