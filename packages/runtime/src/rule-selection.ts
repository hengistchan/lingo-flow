import { generateSelectorCandidates } from '@lingoflow/dom'
import { getDomain, normalizeText } from '@lingoflow/shared'
import type { RuleSelectionKind, RuleSelectionResult } from '@lingoflow/types'

const OVERLAY_ATTRIBUTE = 'data-lingoflow-rule-selection-overlay'

type PendingSelection = {
  kind: RuleSelectionKind
  resolve: (result: RuleSelectionResult) => void
  reject: (error: Error) => void
}

export class RuleSelectionController {
  private readonly document: Document
  private pending: PendingSelection | null = null
  private highlight: HTMLElement | null = null
  private instruction: HTMLElement | null = null
  private hovered: Element | null = null

  constructor(document: Document = globalThis.document) {
    this.document = document
  }

  select(kind: RuleSelectionKind): Promise<RuleSelectionResult> {
    this.cancel('A new page selection replaced the previous one.')
    this.createOverlay(kind)
    this.document.addEventListener('pointermove', this.handlePointerMove, true)
    this.document.addEventListener('click', this.handleClick, true)
    this.document.addEventListener('keydown', this.handleKeyDown, true)

    return new Promise((resolve, reject) => {
      this.pending = { kind, resolve, reject }
    })
  }

  cancel(message = 'Page selection was cancelled.'): void {
    const pending = this.pending
    this.cleanup()
    pending?.reject(new Error(message))
  }

  stop(): void {
    this.cancel()
  }

  private readonly handlePointerMove = (event: Event): void => {
    const target = event.composedPath().find(
      item => item instanceof Element && !item.hasAttribute(OVERLAY_ATTRIBUTE),
    )
    if (!(target instanceof Element)) return
    this.hovered = target
    this.positionHighlight(target)
  }

  private readonly handleClick = (event: MouseEvent): void => {
    if (!this.pending || !this.hovered) return
    event.preventDefault()
    event.stopImmediatePropagation()

    const element = this.hovered
    const result: RuleSelectionResult = {
      kind: this.pending.kind,
      pageUrl: this.document.location.href,
      domain: getDomain(this.document.location.href),
      element: {
        tagName: element.tagName.toLocaleLowerCase(),
        textPreview: normalizeText(element.textContent ?? '').slice(0, 160),
      },
      candidates: generateSelectorCandidates(element, this.document),
    }
    const { resolve } = this.pending
    this.cleanup()
    resolve(result)
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopImmediatePropagation()
    this.cancel()
  }

  private createOverlay(kind: RuleSelectionKind): void {
    const highlight = this.document.createElement('div')
    highlight.setAttribute(OVERLAY_ATTRIBUTE, 'highlight')
    highlight.setAttribute('data-lingoflow-generated', 'true')
    highlight.setAttribute('translate', 'no')
    Object.assign(highlight.style, {
      position: 'fixed',
      zIndex: '2147483646',
      pointerEvents: 'none',
      border: '2px solid #2563eb',
      background: 'rgba(37, 99, 235, 0.12)',
      boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.85) inset',
      borderRadius: '4px',
      display: 'none',
    })

    const instruction = this.document.createElement('div')
    instruction.setAttribute(OVERLAY_ATTRIBUTE, 'instruction')
    instruction.setAttribute('data-lingoflow-generated', 'true')
    instruction.setAttribute('translate', 'no')
    instruction.setAttribute('role', 'status')
    instruction.textContent = selectionInstruction(kind)
    Object.assign(instruction.style, {
      position: 'fixed',
      zIndex: '2147483647',
      top: '16px',
      left: '50%',
      transform: 'translateX(-50%)',
      maxWidth: 'min(560px, calc(100vw - 32px))',
      padding: '10px 14px',
      border: '1px solid rgba(255, 255, 255, 0.22)',
      borderRadius: '999px',
      background: '#172033',
      color: '#ffffff',
      boxShadow: '0 8px 30px rgba(15, 23, 42, 0.3)',
      font: '600 13px/1.4 system-ui, sans-serif',
      pointerEvents: 'none',
    })

    this.document.documentElement.append(highlight, instruction)
    this.highlight = highlight
    this.instruction = instruction
  }

  private positionHighlight(element: Element): void {
    if (!this.highlight) return
    const rect = element.getBoundingClientRect()
    Object.assign(this.highlight.style, {
      display: 'block',
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${Math.max(rect.width, 1)}px`,
      height: `${Math.max(rect.height, 1)}px`,
    })
  }

  private cleanup(): void {
    this.document.removeEventListener('pointermove', this.handlePointerMove, true)
    this.document.removeEventListener('click', this.handleClick, true)
    this.document.removeEventListener('keydown', this.handleKeyDown, true)
    this.highlight?.remove()
    this.instruction?.remove()
    this.highlight = null
    this.instruction = null
    this.hovered = null
    this.pending = null
  }
}

function selectionInstruction(kind: RuleSelectionKind): string {
  if (kind === 'exclude') {
    return 'LingoFlow: select content that should stay untranslated · Esc to cancel'
  }
  if (kind === 'placement') {
    return 'LingoFlow: select the reading area whose translation position you want to change · Esc to cancel'
  }
  return 'LingoFlow: select the main reading area · Esc to cancel'
}
