import { normalizeText, sha256 } from '@lingoflow/shared'
import type { TextBlock, TextBlockType } from '@lingoflow/types'

export const CANDIDATE_SELECTORS = [
  'article h1',
  'article h2',
  'article h3',
  'article p',
  'article li',
  'main h1',
  'main h2',
  'main h3',
  'main p',
  'main li',
  'section p',
  'section li',
  'blockquote',
  'td',
  'th',
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
  '[data-lingoflow-ignore]',
  '[data-lingoflow-translation]',
]

export type CollectTextBlockOptions = {
  sourceLang: 'auto' | string
  targetLang: string
  pageUrl: string
  domain: string
}

export async function collectTextBlocks(root: Document, options: CollectTextBlockOptions): Promise<TextBlock[]> {
  const candidates = uniqueElements(
    Array.from(root.querySelectorAll(CANDIDATE_SELECTORS.join(',')))
      .filter((element): element is HTMLElement => element instanceof HTMLElement)
  )

  const blocks: TextBlock[] = []

  for (const element of candidates) {
    if (!isTranslatableElement(element)) continue

    const text = getElementText(element)
    const normalizedText = normalizeText(text)
    const textHash = await sha256(normalizedText)
    const id = `block_${blocks.length + 1}_${textHash.slice(0, 8)}`

    element.dataset.lingoflowBlockId = id

    blocks.push({
      id,
      elementRefId: id,
      text,
      normalizedText,
      textHash,
      sourceLang: options.sourceLang,
      targetLang: options.targetLang,
      pageUrl: options.pageUrl,
      domain: options.domain,
      meta: {
        tagName: element.tagName.toLowerCase(),
        depth: getElementDepth(element),
        visible: isVisible(element),
        textLength: normalizedText.length,
        blockType: detectBlockType(element),
      },
    })
  }

  return blocks
}

export function isTranslatableElement(element: HTMLElement): boolean {
  if (!isVisible(element)) return false
  if (element.closest(IGNORE_SELECTORS.join(','))) return false
  if (element.dataset.lingoflowBlockId) return false

  const text = normalizeText(getElementText(element))
  if (text.length < 20) return false

  const childTextLength = Array.from(element.children)
    .map(child => normalizeText(getElementText(child as HTMLElement)).length)
    .reduce((sum, length) => sum + length, 0)

  if (element.children.length > 1 && childTextLength > text.length * 0.8) {
    return false
  }

  return true
}

export function isVisible(element: HTMLElement): boolean {
  if (element.hidden || element.getAttribute('aria-hidden') === 'true') return false

  const style = element.ownerDocument.defaultView?.getComputedStyle(element)
  if (style && (style.display === 'none' || style.visibility === 'hidden')) return false

  return true
}

function uniqueElements(elements: HTMLElement[]): HTMLElement[] {
  return [...new Set(elements)]
}

function getElementText(element: HTMLElement): string {
  return element.innerText || element.textContent || ''
}

function getElementDepth(element: HTMLElement): number {
  let depth = 0
  let current: HTMLElement | null = element

  while (current.parentElement) {
    depth += 1
    current = current.parentElement
  }

  return depth
}

export function detectBlockType(element: HTMLElement): TextBlockType {
  const tagName = element.tagName.toLowerCase()

  if (/^h[1-6]$/.test(tagName)) return 'heading'
  if (tagName === 'p') return 'paragraph'
  if (tagName === 'li') return 'list'
  if (tagName === 'blockquote') return 'quote'
  if (tagName === 'td' || tagName === 'th') return 'table'
  return 'unknown'
}
