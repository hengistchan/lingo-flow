import { normalizeText, sha256 } from '@lingoflow/shared'
import type { InlineToken, InlineTokenType, TextBlock, TextBlockType, TranslationInsertion } from '@lingoflow/types'

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

export const CONTENT_ROOT_SELECTORS = [
  '.markdown-body',
  '.prose',
  'article',
  'main',
  '[role="main"]',
  '#content',
  '#mw-content-text',
  '.mw-parser-output',
  '.md-content',
]

export const BLOCK_SELECTORS = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'li',
  'blockquote',
  'td',
  'th',
  'dd',
  'figcaption',
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
  const contentRoots = discoverContentRoots(root)
  const candidates = uniqueElements(
    contentRoots.flatMap(contentRoot =>
      Array.from(contentRoot.querySelectorAll(BLOCK_SELECTORS.join(',')))
        .filter((element): element is HTMLElement => element instanceof HTMLElement)
    )
  )

  const blocks: TextBlock[] = []
  const acceptedElements: HTMLElement[] = []

  for (const element of candidates) {
    if (isInsideAcceptedStructuralBoundary(element, acceptedElements)) continue
    if (!isTranslatableElement(element)) continue

    const carrier = resolveTextCarrier(element)
    const inlineText = extractInlineText(carrier)
    const text = inlineText.text
    const normalizedText = text
    const textHash = await sha256(normalizedText)
    const id = `block_${blocks.length + 1}_${textHash.slice(0, 8)}`
    const blockType = detectBlockType(element)

    carrier.dataset.lingoflowBlockId = id
    acceptedElements.push(carrier)

    blocks.push({
      id,
      elementRefId: id,
      text,
      requestText: inlineText.requestText,
      normalizedText,
      textHash,
      inlineTokens: inlineText.inlineTokens,
      sourceLang: options.sourceLang,
      targetLang: options.targetLang,
      pageUrl: options.pageUrl,
      domain: options.domain,
      meta: {
        tagName: carrier.tagName.toLowerCase(),
        depth: getElementDepth(carrier),
        visible: isVisible(carrier),
        textLength: normalizedText.length,
        blockType,
        insertion: resolveInsertion(element, carrier, blockType, normalizedText),
        carrierTagName: carrier.tagName.toLowerCase(),
      },
    })
  }

  return blocks
}

export function discoverContentRoots(root: Document): HTMLElement[] {
  const explicitRoots = uniqueElements(
    Array.from(root.querySelectorAll(CONTENT_ROOT_SELECTORS.join(',')))
      .filter((element): element is HTMLElement => element instanceof HTMLElement)
      .filter(element => isVisible(element))
      .filter(element => !element.closest(IGNORE_SELECTORS.join(',')))
  )

  if (explicitRoots.length > 0) return explicitRoots

  const scoredRoots = scoreGenericContentRoots(root)
  if (scoredRoots.length > 0) return scoredRoots

  if (root.body) return [root.body]
  return root.documentElement instanceof HTMLElement ? [root.documentElement] : []
}

export function isTranslatableElement(element: HTMLElement): boolean {
  if (!isVisible(element)) return false
  if (element.closest(IGNORE_SELECTORS.join(','))) return false
  if (element.dataset.lingoflowBlockId) return false

  const text = normalizeText(getElementText(element))
  const blockType = detectBlockType(element)
  if (blockType === 'heading') return text.length > 0
  if (blockType === 'table') return text.length >= 20
  if (text.length < 20) return false

  const childTextLength = Array.from(element.children)
    .map(child => normalizeText(getElementText(child as HTMLElement)).length)
    .reduce((sum, length) => sum + length, 0)

  if (blockType !== 'list' && element.children.length > 0 && childTextLength > text.length * 0.8) {
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

function isInsideAcceptedStructuralBoundary(element: HTMLElement, acceptedElements: HTMLElement[]): boolean {
  return acceptedElements.some(accepted => {
    if (accepted === element || !accepted.contains(element)) return false
    const acceptedTagName = accepted.tagName.toLowerCase()
    if (acceptedTagName === 'td' || acceptedTagName === 'th') return true
    if (acceptedTagName === 'li') return isSameListItemParagraphWrapper(element, accepted)
    return false
  })
}

function isSameListItemParagraphWrapper(element: HTMLElement, listItem: HTMLElement): boolean {
  return element.tagName.toLowerCase() === 'p' && element.closest('li') === listItem
}

function scoreGenericContentRoots(root: Document): HTMLElement[] {
  const candidates = Array.from(root.querySelectorAll('section, div'))
    .filter((element): element is HTMLElement => element instanceof HTMLElement)
    .filter(element => isVisible(element))
    .filter(element => !element.closest(IGNORE_SELECTORS.join(',')))
    .map(element => {
      const text = normalizeText(getElementText(element))
      const paragraphs = element.querySelectorAll('p, li').length
      const linkText = Array.from(element.querySelectorAll('a'))
        .map(link => normalizeText(getElementText(link as HTMLElement)).length)
        .reduce((sum, length) => sum + length, 0)
      const linkDensity = text.length === 0 ? 0 : linkText / text.length
      return {
        element,
        score: text.length + paragraphs * 120 - linkDensity * 400,
        textLength: text.length,
        paragraphs,
      }
    })
    .filter(candidate => candidate.textLength >= 80 && candidate.paragraphs > 0)
    .sort((a, b) => b.score - a.score)

  return candidates[0] ? [candidates[0].element] : []
}

function getElementText(element: HTMLElement): string {
  if (element.tagName.toLowerCase() === 'li') return getListItemOwnText(element)
  return element.innerText || element.textContent || ''
}

function getListItemOwnText(element: HTMLElement): string {
  return getElementTextFromPreparedClone(element)
}

function extractInlineText(element: HTMLElement): {
  text: string
  requestText: string
  inlineTokens: InlineToken[]
} {
  const text = normalizeText(getElementText(element))
  const clone = prepareTextClone(element)
  const inlineTokens: InlineToken[] = []

  clone.querySelectorAll('code, kbd, a').forEach(node => {
    if (!(node instanceof HTMLElement)) return
    const tokenText = normalizeText(node.innerText || node.textContent || '')
    if (!tokenText) return

    const type = getInlineTokenType(node)
    const token = createInlineToken(type, tokenText, inlineTokens.length)
    inlineTokens.push(token)
    node.textContent = token.id
  })

  const requestText = protectInlineTextPatterns(
    normalizeText(clone.innerText || clone.textContent || ''),
    inlineTokens,
  )

  return {
    text,
    requestText,
    inlineTokens,
  }
}

function prepareTextClone(element: HTMLElement): HTMLElement {
  const clone = element.cloneNode(true) as HTMLElement
  if (element.tagName.toLowerCase() === 'li') {
    clone.querySelectorAll('ul, ol').forEach(node => node.remove())
  }
  return clone
}

function getElementTextFromPreparedClone(element: HTMLElement): string {
  const clone = prepareTextClone(element)
  return clone.innerText || clone.textContent || ''
}

function resolveTextCarrier(element: HTMLElement): HTMLElement {
  const primaryAnchor = findPrimaryTextAnchor(element)
  return primaryAnchor ?? element
}

function findPrimaryTextAnchor(element: HTMLElement): HTMLElement | null {
  const tagName = element.tagName.toLowerCase()
  if (!/^h[1-6]$/.test(tagName)) return null

  const text = normalizeText(getElementText(element))
  if (text.length < 20) return null

  const anchors = Array.from(element.querySelectorAll('a'))
    .filter(node => normalizeText(getElementText(node)).length >= 20)

  if (anchors.length !== 1) return null

  const anchor = anchors[0]
  const anchorText = normalizeText(getElementText(anchor))
  if (anchorText.length / text.length < 0.8) return null

  return anchor
}

function resolveInsertion(
  source: HTMLElement,
  carrier: HTMLElement,
  blockType: TextBlockType,
  text: string,
): TranslationInsertion {
  const carrierTagName = carrier.tagName.toLowerCase()
  if (carrierTagName === 'a') return 'linebreak-inside'
  if (blockType === 'table') return 'inside-container'
  if (blockType === 'list') return hasNestedList(source) ? 'before-nested-structure' : 'inside-container'
  if (blockType === 'heading') return text.length <= 32 ? 'inline-inside' : 'linebreak-inside'
  if (blockType === 'paragraph' || blockType === 'quote') return 'linebreak-inside'
  return 'after-block'
}

function hasNestedList(element: HTMLElement): boolean {
  return Array.from(element.children).some(child => {
    const tagName = child.tagName.toLowerCase()
    return tagName === 'ul' || tagName === 'ol'
  })
}

function getInlineTokenType(element: HTMLElement): InlineTokenType {
  const tagName = element.tagName.toLowerCase()
  if (tagName === 'a') return 'link'
  if (tagName === 'kbd') return 'keyboard'
  return 'code'
}

function protectInlineTextPatterns(text: string, inlineTokens: InlineToken[]): string {
  return [
    /https?:\/\/[^\s)]+/g,
    /@[a-zA-Z0-9][\w.-]*\/[a-zA-Z0-9][\w.-]*/g,
    /\b[0-9a-f]{7,40}\b/gi,
  ].reduce((value, pattern) =>
    value.replace(pattern, match => {
      const token = createInlineToken('reference', match, inlineTokens.length)
      inlineTokens.push(token)
      return token.id
    }),
    text,
  )
}

function createInlineToken(type: InlineTokenType, text: string, index: number): InlineToken {
  return {
    id: `[[LF${index}]]`,
    type,
    text,
  }
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
