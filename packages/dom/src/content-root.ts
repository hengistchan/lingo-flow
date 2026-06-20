import { normalizeText } from '@lingoflow/shared'
import { IGNORE_SELECTORS, isVisible } from './filters'

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

function scoreGenericContentRoots(root: Document): HTMLElement[] {
  const candidates = Array.from(root.querySelectorAll('section, div'))
    .filter((element): element is HTMLElement => element instanceof HTMLElement)
    .filter(element => isVisible(element))
    .filter(element => !element.closest(IGNORE_SELECTORS.join(',')))
    .map(element => {
      const text = normalizeText(element.innerText || element.textContent || '')
      const paragraphs = element.querySelectorAll('p, li').length
      const linkText = Array.from(element.querySelectorAll('a'))
        .map(link => normalizeText((link as HTMLElement).innerText || link.textContent || '').length)
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

function uniqueElements(elements: HTMLElement[]): HTMLElement[] {
  return [...new Set(elements)]
}
