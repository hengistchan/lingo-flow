import { buildTranslationCacheKey } from '@lingoflow/cache'
import { getDomain, normalizeText, sha256 } from '@lingoflow/shared'
import type {
  MessageResponse,
  PublicRuntimeSettings,
  TranslationResult,
  TranslationTask,
  UiLocale,
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
  '[data-lingoflow-hover-card]',
].join(',')

const MAX_HOVER_TEXT_LENGTH = 1200

export type HoverTextHit = {
  text: string
  container: HTMLElement
  anchor: { x: number; y: number }
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
}

export class HoverTranslationController {
  private readonly document: Document
  private readonly runtime: RuntimeMessenger
  private readonly popover: HoverTranslationPopover
  private pointer: { x: number; y: number } | null = null
  private started = false
  private requestGeneration = 0

  constructor(dependencies: HoverTranslationDependencies = {}) {
    this.document = dependencies.document ?? document
    this.runtime = dependencies.chromeRuntime ?? chrome.runtime
    this.popover = new HoverTranslationPopover(this.document)
  }

  start(): void {
    if (this.started) return
    this.started = true
    this.document.addEventListener('pointermove', this.handlePointerMove, { passive: true, capture: true })
    this.document.addEventListener('keydown', this.handleKeyDown, true)
  }

  stop(): void {
    if (!this.started) return
    this.started = false
    this.document.removeEventListener('pointermove', this.handlePointerMove, true)
    this.document.removeEventListener('keydown', this.handleKeyDown, true)
    this.dismiss()
  }

  dismiss(): void {
    this.requestGeneration += 1
    this.popover.dismiss()
  }

  async translateHoveredText(): Promise<{
    status: 'success' | 'failed' | 'no-text' | 'stale'
    sourceText?: string
    translatedText?: string
    fromCache?: boolean
  }> {
    const hit = this.resolveCurrentHit()
    if (!hit) {
      this.popover.showNoText(this.pointer ?? viewportCenter(this.document))
      return { status: 'no-text' }
    }

    const generation = ++this.requestGeneration
    this.popover.showLoading(hit)

    try {
      const settings = await this.sendMessage<PublicRuntimeSettings>({ type: 'settings/getRuntime' })
      const task = await createHoverTranslationTask(hit.text, settings, this.document.location.href, generation)
      const result = await this.resolveTranslation(task, settings)

      if (generation !== this.requestGeneration) return { status: 'stale', sourceText: hit.text }
      if (result.status === 'failed') {
        this.popover.showError(hit, result.error.message)
        return { status: 'failed', sourceText: hit.text }
      }

      this.popover.showTranslation(hit, result.translatedText, settings.targetLang)
      return {
        status: 'success',
        sourceText: hit.text,
        translatedText: result.translatedText,
        fromCache: result.fromCache,
      }
    } catch (error) {
      if (generation !== this.requestGeneration) return { status: 'stale', sourceText: hit.text }
      this.popover.showError(hit, error instanceof Error ? error.message : String(error))
      return { status: 'failed', sourceText: hit.text }
    }
  }

  private readonly handlePointerMove = (event: PointerEvent): void => {
    this.pointer = { x: event.clientX, y: event.clientY }
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this.popover.isVisible()) {
      event.preventDefault()
      this.dismiss()
      return
    }

    if (!isHoverTranslationShortcut(event) || isEditableTarget(event.target)) return
    event.preventDefault()
    event.stopPropagation()
    void this.translateHoveredText()
  }

  private resolveCurrentHit(): HoverTextHit | null {
    const selection = resolveSelectedText(this.document, this.pointer)
    if (selection) return selection
    if (this.pointer) {
      const caretHit = resolveTextAtPoint(this.document, this.pointer.x, this.pointer.y)
      if (caretHit) return caretHit
    }
    return resolveHoveredText(this.document, this.pointer ?? viewportCenter(this.document))
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

export function isHoverTranslationShortcut(event: Pick<KeyboardEvent, 'altKey' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'code' | 'repeat' | 'isComposing'>): boolean {
  return (
    event.altKey &&
    event.shiftKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    event.code === 'KeyL' &&
    !event.repeat &&
    !event.isComposing
  )
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

  const rawText = container.textContent ?? ''
  const offset = getTextOffset(container, caret.node, caret.offset)
  if (offset === null) return null
  const sentence = segmentSentenceAtOffset(rawText, offset)
  if (!sentence || sentence.text.length < 2) return null

  return {
    text: sentence.text,
    container,
    anchor: { x, y },
    source: 'caret',
  }
}

export function resolveHoveredText(document: Document, anchor: { x: number; y: number }): HoverTextHit | null {
  let hovered: Element | null = null
  try {
    const hoveredElements = document.querySelectorAll(':hover')
    hovered = hoveredElements.item(hoveredElements.length - 1)
  } catch {
    hovered = document.elementFromPoint?.(anchor.x, anchor.y) ?? null
  }
  if (!hovered) hovered = document.elementFromPoint?.(anchor.x, anchor.y) ?? null
  if (!hovered) return null
  const container = findTextContainer(hovered)
  if (!container) return null
  const text = normalizeText(container.textContent ?? '').slice(0, MAX_HOVER_TEXT_LENGTH)
  if (text.length < 2) return null
  return { text, container, anchor, source: 'hover-element' }
}

async function createHoverTranslationTask(
  sourceText: string,
  settings: PublicRuntimeSettings,
  pageUrl: string,
  generation: number,
): Promise<TranslationTask> {
  const normalizedText = normalizeText(sourceText)
  const textHash = await sha256(normalizedText)
  const cacheKey = buildTranslationCacheKey({
    textHash,
    sourceLang: settings.sourceLang,
    targetLang: settings.targetLang,
    providerId: settings.providerId,
    model: settings.model,
    promptVersion: settings.promptVersion,
    normalizeVersion: settings.normalizeVersion,
  })
  const runId = `hover_${Date.now()}_${generation}`
  const domain = getDomain(pageUrl)

  return {
    id: `task_hover_${textHash.slice(0, 12)}_${generation}`,
    blockId: `hover_${textHash.slice(0, 12)}`,
    sourceText: normalizedText,
    requestText: normalizedText,
    normalizedText,
    textHash,
    inlineTokens: [],
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
      ruleId: 'hover-shortcut',
      runId,
      rootGeneration: 0,
    },
  }
}

function resolveSelectedText(document: Document, pointer: { x: number; y: number } | null): HoverTextHit | null {
  const selection = document.getSelection?.()
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null
  const text = normalizeText(selection.toString()).slice(0, MAX_HOVER_TEXT_LENGTH)
  if (text.length < 2) return null
  const range = selection.getRangeAt(0)
  const container = findTextContainer(range.commonAncestorContainer)
  if (!container) return null
  const rect = range.getBoundingClientRect?.()
  const anchor = pointer ?? {
    x: rect ? rect.left + rect.width / 2 : 24,
    y: rect ? rect.bottom : 24,
  }
  return { text, container, anchor, source: 'selection' }
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

function trimSegment(segment: string, index: number): { text: string; start: number; end: number } | null {
  const leading = segment.match(/^\s*/)?.[0].length ?? 0
  const trailing = segment.match(/\s*$/)?.[0].length ?? 0
  const start = index + leading
  const end = index + segment.length - trailing
  const text = segment.slice(leading, segment.length - trailing)
  return text.length >= 2 ? { text, start, end } : null
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')
}

function viewportCenter(document: Document): { x: number; y: number } {
  const view = document.defaultView
  return { x: (view?.innerWidth ?? 360) / 2, y: (view?.innerHeight ?? 240) / 2 }
}

class HoverTranslationPopover {
  private readonly document: Document
  private host: HTMLElement | null = null
  private shadow: ShadowRoot | null = null

  constructor(document: Document) {
    this.document = document
  }

  isVisible(): boolean {
    return !!this.host?.isConnected
  }

  dismiss(): void {
    this.host?.remove()
    this.host = null
    this.shadow = null
  }

  showLoading(hit: HoverTextHit): void {
    const copy = getPopoverCopy(this.document)
    this.render({
      state: 'loading',
      anchor: hit.anchor,
      eyebrow: copy.sentence,
      sourceText: hit.text,
      translatedText: copy.translating,
    })
  }

  showTranslation(hit: HoverTextHit, translatedText: string, targetLang: string): void {
    const copy = getPopoverCopy(this.document)
    this.render({
      state: 'success',
      anchor: hit.anchor,
      eyebrow: `${copy.sentence} · ${targetLang}`,
      sourceText: hit.text,
      translatedText,
    })
  }

  showNoText(anchor: { x: number; y: number }): void {
    const copy = getPopoverCopy(this.document)
    this.render({
      state: 'error',
      anchor,
      eyebrow: copy.sentence,
      sourceText: '',
      translatedText: copy.noText,
    })
  }

  showError(hit: HoverTextHit, error: string): void {
    const copy = getPopoverCopy(this.document)
    const providerMissing = /config|provider|api key/i.test(error)
    this.render({
      state: 'error',
      anchor: hit.anchor,
      eyebrow: copy.sentence,
      sourceText: hit.text,
      translatedText: providerMissing ? copy.configureProvider : copy.failed,
    })
  }

  private render(input: {
    state: 'loading' | 'success' | 'error'
    anchor: { x: number; y: number }
    eyebrow: string
    sourceText: string
    translatedText: string
  }): void {
    this.ensureHost()
    if (!this.host || !this.shadow) return
    this.host.dataset.state = input.state
    this.shadow.replaceChildren(createPopoverStyle(this.document), createPopoverCard(this.document, input, () => this.dismiss()))
    positionHost(this.host, input.anchor, this.document)
  }

  private ensureHost(): void {
    if (this.host?.isConnected) return
    this.host = this.document.createElement('div')
    this.host.dataset.lingoflowHoverCard = 'true'
    this.host.dataset.lingoflowGenerated = 'true'
    this.host.style.position = 'fixed'
    this.host.style.zIndex = '2147483647'
    this.host.style.display = 'block'
    this.shadow = this.host.attachShadow({ mode: 'open' })
    this.document.documentElement.appendChild(this.host)
  }
}

function createPopoverCard(
  document: Document,
  input: { state: string; eyebrow: string; sourceText: string; translatedText: string },
  onClose: () => void,
): HTMLElement {
  const card = document.createElement('aside')
  card.className = 'card'
  card.setAttribute('role', 'dialog')
  card.setAttribute('aria-live', 'polite')
  card.setAttribute('aria-label', 'LingoFlow hover translation')

  const header = document.createElement('div')
  header.className = 'header'
  const eyebrow = document.createElement('span')
  eyebrow.className = 'eyebrow'
  eyebrow.textContent = `LINGOFLOW / ${input.eyebrow}`
  const close = document.createElement('button')
  close.className = 'close'
  close.type = 'button'
  close.setAttribute('aria-label', 'Close translation')
  close.textContent = '×'
  close.addEventListener('click', onClose)
  header.append(eyebrow, close)
  card.appendChild(header)

  if (input.sourceText) {
    const source = document.createElement('p')
    source.className = 'source'
    source.textContent = input.sourceText
    card.appendChild(source)
  }

  const divider = document.createElement('div')
  divider.className = 'divider'
  const translation = document.createElement('p')
  translation.className = `translation ${input.state}`
  translation.textContent = input.translatedText
  card.append(divider, translation)
  return card
}

function createPopoverStyle(document: Document): HTMLStyleElement {
  const style = document.createElement('style')
  style.textContent = `
    :host { all: initial; color-scheme: light dark; }
    .card {
      box-sizing: border-box;
      width: min(360px, calc(100vw - 24px));
      max-height: min(420px, calc(100vh - 24px));
      overflow: auto;
      position: relative;
      margin: 0;
      border: 1px solid #e0dbd3;
      border-left: 4px solid #c05a2e;
      border-radius: 0;
      background: #faf8f5;
      color: #1a1a1a;
      box-shadow: 0 14px 38px rgba(42, 34, 28, 0.18), 0 2px 8px rgba(42, 34, 28, 0.08);
      padding: 14px 16px 16px;
      font-family: system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      animation: lf-note-in 140ms ease-out;
    }
    .card::before {
      content: "";
      position: absolute;
      left: -12px;
      top: 20px;
      width: 8px;
      height: 1px;
      background: #c05a2e;
    }
    .header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .eyebrow { color: #6b6560; font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }
    .close { appearance: none; border: 0; background: transparent; color: #6b6560; padding: 0; width: 24px; height: 24px; cursor: pointer; font: 20px/1 system-ui, sans-serif; }
    .close:hover, .close:focus-visible { color: #c05a2e; outline: none; }
    .source, .translation { margin: 0; overflow-wrap: anywhere; }
    .source { padding-top: 10px; color: #6b6560; font: 13px/1.55 Georgia, "Noto Serif", "Source Han Serif SC", "Songti SC", serif; }
    .divider { width: 34px; height: 1px; margin: 12px 0 10px; background: #c05a2e; }
    .translation { color: #1a1a1a; font: 16px/1.6 Georgia, "Noto Serif", "Source Han Serif SC", "Songti SC", serif; }
    .translation.loading { color: #6b6560; font-family: system-ui, sans-serif; font-size: 13px; }
    .translation.error { color: #9b3b2a; font-family: system-ui, sans-serif; font-size: 13px; }
    @keyframes lf-note-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
    @media (prefers-reduced-motion: reduce) { .card { animation: none; } }
    @media (prefers-color-scheme: dark) {
      .card { background: #1c1b19; color: #e8e4de; border-color: #3a3830; border-left-color: #d4764e; box-shadow: 0 16px 40px rgba(0, 0, 0, 0.42); }
      .card::before, .divider { background: #d4764e; }
      .eyebrow, .close, .source, .translation.loading { color: #9e978c; }
      .translation { color: #e8e4de; }
      .translation.error { color: #e18b69; }
      .close:hover, .close:focus-visible { color: #d4764e; }
    }
  `
  return style
}

function positionHost(host: HTMLElement, anchor: { x: number; y: number }, document: Document): void {
  const view = document.defaultView
  const viewportWidth = view?.innerWidth ?? 1024
  const viewportHeight = view?.innerHeight ?? 768
  const width = Math.min(360, viewportWidth - 24)
  const estimatedHeight = Math.min(host.shadowRoot?.querySelector('.card')?.scrollHeight ?? 220, viewportHeight - 24)
  const left = Math.max(12, Math.min(anchor.x + 16, viewportWidth - width - 12))
  const below = anchor.y + 18
  const top = below + estimatedHeight <= viewportHeight - 12
    ? below
    : Math.max(12, anchor.y - estimatedHeight - 18)
  host.style.left = `${left}px`
  host.style.top = `${top}px`
}

function getPopoverCopy(document: Document): {
  sentence: string
  translating: string
  noText: string
  configureProvider: string
  failed: string
} {
  const locale: UiLocale = /^zh\b/i.test(document.defaultView?.navigator.language ?? '') ? 'zh-Hans' : 'en'
  return locale === 'zh-Hans'
    ? {
        sentence: '句段翻译',
        translating: '正在翻译鼠标所指句段…',
        noText: '请将鼠标指向可阅读文字后再按快捷键。',
        configureProvider: '请先在 LingoFlow 设置中配置翻译服务。',
        failed: '翻译失败，请检查翻译服务后重试。',
      }
    : {
        sentence: 'Sentence translation',
        translating: 'Translating the text under your pointer…',
        noText: 'Point to readable text, then press the shortcut again.',
        configureProvider: 'Configure a translation provider in LingoFlow settings.',
        failed: 'Translation failed. Check the provider and try again.',
      }
}
