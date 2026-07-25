import { buildTranslationCacheKey } from '@lingoflow/cache'
import { applyGlossary, resolveGlossary } from '@lingoflow/glossary'
import { clearPartialTranslations, renderPartialTranslation } from '@lingoflow/renderer'
import { getDomain, normalizeText, sha256 } from '@lingoflow/shared'
import type {
  MessageResponse,
  PublicRuntimeSettings,
  TranslationResult,
  TranslationTask,
} from '@lingoflow/types'

const TEXT_CONTAINER_SELECTOR = [
  'p',
  'li',
  'blockquote',
  'td',
  'th',
  'dd',
  'figcaption',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  '[role="article"]',
  'article',
  'div',
].join(',')

const EXCLUDED_SELECTOR = [
  'input',
  'textarea',
  'select',
  'button',
  'pre',
  'code',
  '[contenteditable="true"]',
  '[data-lingoflow-generated]',
].join(',')

const MAX_PARTIAL_TEXT_LENGTH = 1200

export type HoverTextHit = {
  text: string
  container: HTMLElement
  start: number
  end: number
  point: { x: number; y: number }
  source: 'caret' | 'hover-element' | 'selection'
}

type RuntimeMessenger = Pick<typeof chrome.runtime, 'sendMessage'>

type CaretDocument = Document & {
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
  caretRangeFromPoint?: (x: number, y: number) => Range | null
}

type HoverTranslationDependencies = {
  document?: Document
  chromeRuntime?: RuntimeMessenger
  getContext?: () => {
    sourceLang?: string
    targetLang?: string
    ruleIds?: string[]
  }
}

export class HoverTranslationController {
  private readonly document: Document
  private readonly runtime: RuntimeMessenger
  private readonly getContext: NonNullable<HoverTranslationDependencies['getContext']>
  private readonly sourceKeys = new WeakMap<HTMLElement, string>()
  private readonly requestVersions = new Map<string, number>()
  private pointer: { x: number; y: number } | null = null
  private started = false
  private sourceSequence = 0
  private requestSequence = 0

  constructor(dependencies: HoverTranslationDependencies = {}) {
    this.document = dependencies.document ?? document
    this.runtime = dependencies.chromeRuntime ?? chrome.runtime
    this.getContext = dependencies.getContext ?? (() => ({}))
  }

  start(): void {
    if (this.started) return
    this.started = true
    this.document.addEventListener('pointermove', this.handlePointerMove, { passive: true, capture: true })
  }

  stop(): void {
    if (!this.started) return
    this.started = false
    this.document.removeEventListener('pointermove', this.handlePointerMove, true)
    this.dismiss()
  }

  dismiss(): void {
    this.requestVersions.clear()
    clearPartialTranslations(this.document)
  }

  async translateHoveredText(): Promise<{
    status: 'success' | 'failed' | 'no-text' | 'stale'
    sourceText?: string
    translatedText?: string
    fromCache?: boolean
  }> {
    const hit = this.resolveCurrentHit()
    if (!hit) return { status: 'no-text' }

    const sourceKey = this.getSourceKey(hit.container)
    const translationId = `partial_${sourceKey}_${hit.start}_${hit.end}`
    const requestVersion = ++this.requestSequence
    this.requestVersions.set(translationId, requestVersion)
    this.render(hit, {
      id: translationId,
      sourceKey,
      state: 'loading',
    })

    try {
      const savedSettings = await this.sendMessage<PublicRuntimeSettings>({ type: 'settings/getRuntime' })
      const pageContext = this.getContext()
      const settings = {
        ...savedSettings,
        sourceLang: pageContext.sourceLang ?? savedSettings.sourceLang,
        targetLang: pageContext.targetLang ?? savedSettings.targetLang,
      }
      const task = await createHoverTranslationTask(
        translationId,
        hit.text,
        settings,
        this.document.location.href,
        requestVersion,
        pageContext.ruleIds ?? [],
      )
      const result = await this.resolveTranslation(task, settings)

      if (!this.isCurrentRequest(translationId, requestVersion)) {
        return { status: 'stale', sourceText: hit.text }
      }
      if (result.status === 'failed') {
        this.render(hit, {
          id: translationId,
          sourceKey,
          state: 'error',
          translatedText: partialTranslationError(this.document, result.error.message),
        })
        return { status: 'failed', sourceText: hit.text }
      }

      this.render(hit, {
        id: translationId,
        sourceKey,
        state: 'success',
        translatedText: result.translatedText,
        targetLang: settings.targetLang,
      })
      return {
        status: 'success',
        sourceText: hit.text,
        translatedText: result.translatedText,
        fromCache: result.fromCache,
      }
    } catch (error) {
      if (!this.isCurrentRequest(translationId, requestVersion)) {
        return { status: 'stale', sourceText: hit.text }
      }
      this.render(hit, {
        id: translationId,
        sourceKey,
        state: 'error',
        translatedText: partialTranslationError(
          this.document,
          error instanceof Error ? error.message : String(error),
        ),
      })
      return { status: 'failed', sourceText: hit.text }
    } finally {
      if (this.isCurrentRequest(translationId, requestVersion)) {
        this.requestVersions.delete(translationId)
      }
    }
  }

  private readonly handlePointerMove = (event: PointerEvent): void => {
    this.pointer = { x: event.clientX, y: event.clientY }
  }

  private resolveCurrentHit(): HoverTextHit | null {
    const selection = resolveSelectedText(this.document, this.pointer)
    if (selection) return selection
    if (this.pointer) {
      const caretHit = resolveTextAtPoint(this.document, this.pointer.x, this.pointer.y)
      if (caretHit) return caretHit
      return resolveHoveredText(this.document, this.pointer)
    }
    return null
  }

  private getSourceKey(container: HTMLElement): string {
    const existing = this.sourceKeys.get(container)
    if (existing) return existing
    const key = `source_${++this.sourceSequence}`
    this.sourceKeys.set(container, key)
    return key
  }

  private isCurrentRequest(translationId: string, requestVersion: number): boolean {
    return this.requestVersions.get(translationId) === requestVersion
  }

  private render(
    hit: HoverTextHit,
    input: {
      id: string
      sourceKey: string
      state: 'loading' | 'success' | 'error'
      translatedText?: string
      targetLang?: string
    },
  ): void {
    renderPartialTranslation({
      ...input,
      sourceElement: hit.container,
      sourceOrder: hit.start,
    })
  }

  private async resolveTranslation(
    task: TranslationTask,
    settings: PublicRuntimeSettings,
  ): Promise<TranslationResult> {
    if (settings.cacheEnabled) {
      try {
        const cached = await this.sendMessage<{ hits: TranslationResult[]; misses: TranslationTask[] }>({
          type: 'translation-cache/resolve',
          payload: { tasks: [task] },
        })
        const hit = cached.hits[0]
        if (hit) return hit
      } catch {
        // Cache is an optimization. A read failure must not block an explicit
        // user translation gesture.
      }
    }

    const response = await this.sendMessage<{ results: TranslationResult[] }>({
      type: 'translation/translateBatch',
      payload: { tasks: [task] },
    })
    const result = response.results[0]
    if (!result) throw new Error('Translation provider returned no result.')
    return result
  }

  private async sendMessage<T>(message: unknown): Promise<T> {
    const response = await this.runtime.sendMessage(message) as MessageResponse<T>
    if (!response?.ok) throw new Error(response?.error?.message ?? 'LingoFlow message failed')
    return response.data
  }
}

export function segmentSentenceAtOffset(text: string, offset: number): { text: string; start: number; end: number } | null {
  if (!text) return null
  const safeOffset = Math.max(0, Math.min(offset, text.length))

  if (typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'sentence' })
    const segments = [...segmenter.segment(text)]
    const match = segments.find(segment => safeOffset >= segment.index && safeOffset <= segment.index + segment.segment.length)
      ?? segments.find(segment => segment.index > safeOffset)
      ?? segments.at(-1)
    if (match) return trimSegment(match.segment, match.index)
  }

  let start = safeOffset
  while (start > 0 && !/[.!?。！？\n]/.test(text[start - 1])) start -= 1
  let end = safeOffset
  while (end < text.length && !/[.!?。！？\n]/.test(text[end])) end += 1
  if (end < text.length && /[.!?。！？]/.test(text[end])) end += 1
  return trimSegment(text.slice(start, end), start)
}

export function resolveTextAtPoint(document: Document, x: number, y: number): HoverTextHit | null {
  const caret = resolveCaret(document, x, y)
  if (!caret) return null
  const container = findTextContainer(caret.node)
  if (!container) return null

  const rawText = readSourceText(container)
  const offset = getTextOffset(container, caret.node, caret.offset)
  if (offset === null) return null
  const sentence = segmentSentenceAtOffset(rawText, offset)
  if (!sentence || sentence.text.length < 2) return null

  return {
    text: sentence.text,
    container,
    start: sentence.start,
    end: sentence.end,
    point: { x, y },
    source: 'caret',
  }
}

export function resolveHoveredText(document: Document, point: { x: number; y: number }): HoverTextHit | null {
  let hovered: Element | null = null
  try {
    const hoveredElements = document.querySelectorAll(':hover')
    hovered = hoveredElements.item(hoveredElements.length - 1)
  } catch {
    hovered = document.elementFromPoint?.(point.x, point.y) ?? null
  }
  if (!hovered) hovered = document.elementFromPoint?.(point.x, point.y) ?? null
  if (!hovered) return null
  const container = findTextContainer(hovered)
  if (!container) return null
  const text = normalizeText(readSourceText(container)).slice(0, MAX_PARTIAL_TEXT_LENGTH)
  if (text.length < 2) return null
  return {
    text,
    container,
    start: 0,
    end: text.length,
    point,
    source: 'hover-element',
  }
}

async function createHoverTranslationTask(
  translationId: string,
  sourceText: string,
  settings: PublicRuntimeSettings,
  pageUrl: string,
  requestVersion: number,
  ruleIds: string[] = [],
): Promise<TranslationTask> {
  const normalizedText = normalizeText(sourceText)
  const textHash = await sha256(normalizedText)
  const domain = getDomain(pageUrl)
  const appliedGlossary = applyGlossary(
    normalizedText,
    resolveGlossary(settings.glossaries ?? [], {
      domain,
      ruleIds,
      sourceLang: settings.sourceLang,
      targetLang: settings.targetLang,
    }),
  )
  const cacheKey = buildTranslationCacheKey({
    textHash,
    sourceLang: settings.sourceLang,
    targetLang: settings.targetLang,
    providerId: settings.providerId,
    model: settings.model,
    promptVersion: settings.promptVersion,
    normalizeVersion: settings.normalizeVersion,
    semanticsFingerprint: appliedGlossary.semanticsFingerprint,
  })
  const runId = `partial_${Date.now()}_${requestVersion}`

  return {
    id: `task_${translationId}_${requestVersion}`,
    blockId: translationId,
    sourceText: normalizedText,
    requestText: appliedGlossary.requestText,
    normalizedText,
    textHash,
    inlineTokens: [],
    glossaryTokens: appliedGlossary.tokens,
    glossary: appliedGlossary.constraints,
    glossaryIds: appliedGlossary.glossaryIds,
    semanticsFingerprint: appliedGlossary.semanticsFingerprint,
    sourceLang: settings.sourceLang,
    targetLang: settings.targetLang,
    providerId: settings.providerId,
    model: settings.model,
    promptVersion: settings.promptVersion,
    normalizeVersion: settings.normalizeVersion,
    cacheKey,
    pageUrl,
    domain,
    meta: {
      url: pageUrl,
      domain,
      ruleId: 'pointer-sentence',
      runId,
      rootGeneration: 0,
    },
  }
}

function resolveSelectedText(
  document: Document,
  pointer: { x: number; y: number } | null,
): HoverTextHit | null {
  const selection = document.getSelection?.()
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  const startContainer = findTextContainer(range.startContainer)
  const endContainer = findTextContainer(range.endContainer)
  if (!startContainer || startContainer !== endContainer) return null

  const text = normalizeText(selection.toString()).slice(0, MAX_PARTIAL_TEXT_LENGTH)
  if (text.length < 2) return null
  const start = getTextOffset(startContainer, range.startContainer, range.startOffset) ?? 0
  const rawEnd = getTextOffset(startContainer, range.endContainer, range.endOffset) ?? start + text.length
  const rect = range.getBoundingClientRect?.()
  const point = pointer ?? {
    x: rect ? rect.left + rect.width / 2 : 0,
    y: rect ? rect.bottom : 0,
  }
  return {
    text,
    container: startContainer,
    start,
    end: Math.max(start + text.length, rawEnd),
    point,
    source: 'selection',
  }
}

function resolveCaret(document: Document, x: number, y: number): { node: Node; offset: number } | null {
  const caretDocument = document as CaretDocument
  const position = caretDocument.caretPositionFromPoint?.(x, y)
  if (position) return { node: position.offsetNode, offset: position.offset }
  const range = caretDocument.caretRangeFromPoint?.(x, y)
  return range ? { node: range.startContainer, offset: range.startOffset } : null
}

function findTextContainer(node: Node): HTMLElement | null {
  const element = node instanceof HTMLElement ? node : node.parentElement
  if (!element || element.closest(EXCLUDED_SELECTOR)) return null
  const container = element.closest(TEXT_CONTAINER_SELECTOR)
  if (!(container instanceof HTMLElement) || container.closest(EXCLUDED_SELECTOR)) return null
  return container
}

function getTextOffset(container: HTMLElement, node: Node, offset: number): number | null {
  try {
    const range = container.ownerDocument.createRange()
    range.selectNodeContents(container)
    range.setEnd(node, offset)
    return range.toString().length
  } catch {
    return null
  }
}

function readSourceText(container: HTMLElement): string {
  const clone = container.cloneNode(true) as HTMLElement
  clone.querySelectorAll('[data-lingoflow-generated]').forEach(node => node.remove())
  return clone.textContent ?? ''
}

function trimSegment(segment: string, index: number): { text: string; start: number; end: number } | null {
  const leading = segment.match(/^\s*/)?.[0].length ?? 0
  const trailing = segment.match(/\s*$/)?.[0].length ?? 0
  const start = index + leading
  const end = index + segment.length - trailing
  const text = segment.slice(leading, segment.length - trailing)
  return text.length >= 2 ? { text, start, end } : null
}

function partialTranslationError(document: Document, error: string): string {
  const providerMissing = /config|provider|api key/i.test(error)
  const chinese = /^zh\b/i.test(document.defaultView?.navigator.language ?? '')
  if (chinese) {
    return providerMissing
      ? '请先在 LingoFlow 设置中配置翻译服务。'
      : '句段翻译失败，请检查翻译服务后重试。'
  }
  return providerMissing
    ? 'Configure a translation provider in LingoFlow settings.'
    : 'Sentence translation failed. Check the provider and try again.'
}
