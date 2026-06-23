import { normalizeText } from '@lingoflow/shared'

const BLOCK_LEVEL_CHILDREN = 'p,div,h1,h2,h3,h4,h5,h6,li,ul,ol,blockquote,table,dl,dt,dd,figure,figcaption,section,article,nav,form,pre'

export const UI_EXCLUSION_SELECTORS = [
  'button',
  '[role="button"]',
  '[role="menu"]',
  '[role="menubar"]',
  '[role="toolbar"]',
  '[role="tablist"]',
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[role="status"]',
  '[role="alert"]',
  '[role="badge"]',
  'nav',
  'form',
  'footer',
  'header',
  '[data-lingoflow-ignore]',
  '[data-lingoflow-generated]',
  '[data-lingoflow-translation]',
]

export const IGNORE_SELECTORS = [
  'script',
  'style',
  'code',
  'pre',
  'textarea',
  'input',
  'button',
  'select',
  'nav',
  'footer',
  'header',
  'svg',
  'canvas',
  '[contenteditable="true"]',
  '[translate="no"]',
  '.notranslate',
  '[data-lingoflow-ignore]',
  '[data-lingoflow-generated]',
  '[data-lingoflow-translation]',
]

export const INTERACTIVE_SELECTORS = [
  'a',
  'button',
  'input',
  'select',
  'textarea',
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="checkbox"]',
  '[role="radio"]',
]

export function isGeneratedByLingoFlow(element: HTMLElement): boolean {
  if (element.dataset.lingoflowGenerated === 'true') return true
  if (element.dataset.lingoflowTranslation) return true
  if (element.dataset.lingoflowTranslationBreak) return true
  if (element.dataset.lingoflowTranslationSpacer) return true
  return !!element.closest(
    '[data-lingoflow-generated="true"], [data-lingoflow-translation], [data-lingoflow-translation-break], [data-lingoflow-translation-spacer]',
  )
}

export function hasTooManyInteractiveElements(element: HTMLElement, maxInteractiveElements = 5): boolean {
  const interactiveCount = element.querySelectorAll(INTERACTIVE_SELECTORS.join(',')).length
  return interactiveCount >= maxInteractiveElements
}

export function isTranslatableTableCell(element: HTMLElement, maxInteractiveElements = 4): boolean {
  const tagName = element.tagName.toLowerCase()
  if (tagName !== 'td' && tagName !== 'th') return true

  const interactiveCount = element.querySelectorAll(INTERACTIVE_SELECTORS.join(',')).length
  return interactiveCount < maxInteractiveElements
}

export function isInsideUIExclusion(element: HTMLElement): boolean {
  return !!element.closest(UI_EXCLUSION_SELECTORS.join(','))
}

export function isVisible(element: HTMLElement): boolean {
  if (element.hidden || element.getAttribute('aria-hidden') === 'true') return false

  const style = element.ownerDocument.defaultView?.getComputedStyle(element)
  if (style && (style.display === 'none' || style.visibility === 'hidden')) return false

  return true
}

export type TranslatableElementOptions = {
  minTextLength?: number
}

export function isTranslatableElement(element: HTMLElement, options: TranslatableElementOptions = {}): boolean {
  if (!isVisible(element)) return false
  if (element.closest(IGNORE_SELECTORS.join(','))) return false
  if (element.dataset.lingoflowBlockId) return false

  const text = normalizeText(getElementText(element))
  const minTextLength = options.minTextLength ?? 20
  const blockType = detectBlockTypeForFilter(element)
  if (blockType === 'heading') return text.length > 0
  if (blockType === 'table') return text.length >= minTextLength
  if (blockType === 'caption' || blockType === 'description') return text.length > 0
  if (text.length < minTextLength) return false

  const childTextLength = Array.from(element.children)
    .map(child => normalizeText(getElementText(child as HTMLElement)).length)
    .reduce((sum, length) => sum + length, 0)

  if (blockType !== 'list' && element.children.length > 0 && childTextLength > text.length * 0.8) {
    return false
  }

  return true
}

function detectBlockTypeForFilter(element: HTMLElement): string {
  const tagName = element.tagName.toLowerCase()
  if (/^h[1-6]$/.test(tagName)) return 'heading'
  if (tagName === 'p' || tagName === 'div') return 'paragraph'
  if (tagName === 'li') return 'list'
  if (tagName === 'blockquote') return 'quote'
  if (tagName === 'td' || tagName === 'th') return 'table'
  if (tagName === 'figcaption') return 'caption'
  if (tagName === 'dd') return 'description'
  return 'unknown'
}

function getElementText(element: HTMLElement): string {
  return element.innerText || element.textContent || ''
}

export function hasBlockLevelChildren(element: HTMLElement): boolean {
  return !!element.querySelector(BLOCK_LEVEL_CHILDREN)
}
