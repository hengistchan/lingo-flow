import { normalizeText } from '@lingoflow/shared'
import type { InlineToken, InlineTokenType } from '@lingoflow/types'

const GENERATED_CONTENT_SELECTOR = [
  '[data-lingoflow-generated]',
  '[data-lingoflow-translation]',
  '[data-lingoflow-translation-break]',
  '[data-lingoflow-translation-spacer]',
].join(',')

export function extractInlineText(element: HTMLElement): {
  text: string
  requestText: string
  inlineTokens: InlineToken[]
} {
  const text = getSourceOnlyText(element)
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

export function prepareTextClone(element: HTMLElement): HTMLElement {
  const clone = element.cloneNode(true) as HTMLElement
  if (clone.matches(GENERATED_CONTENT_SELECTOR)) {
    clone.replaceChildren()
    return clone
  }
  clone.querySelectorAll(GENERATED_CONTENT_SELECTOR).forEach(node => node.remove())
  if (element.tagName.toLowerCase() === 'li') {
    clone.querySelectorAll('ul, ol').forEach(node => node.remove())
  }
  return clone
}

export function getSourceOnlyText(element: HTMLElement): string {
  if (
    element.tagName.toLowerCase() !== 'li' &&
    !element.matches(GENERATED_CONTENT_SELECTOR) &&
    !element.querySelector(GENERATED_CONTENT_SELECTOR)
  ) {
    return normalizeText(element.innerText || element.textContent || '')
  }
  return normalizeText(getPreparedElementText(prepareTextClone(element)))
}

function getPreparedElementText(element: HTMLElement): string {
  return element.innerText || element.textContent || ''
}

function getInlineTokenType(element: HTMLElement): InlineTokenType {
  const tagName = element.tagName.toLowerCase()
  if (tagName === 'a') return 'link'
  if (tagName === 'kbd') return 'keyboard'
  return 'code'
}

export function protectInlineTextPatterns(text: string, inlineTokens: InlineToken[]): string {
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
    id: `⟦LF:${index}⟧`,
    type,
    text,
  }
}
