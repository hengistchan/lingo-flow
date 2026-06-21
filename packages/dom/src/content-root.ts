import { normalizeText } from '@lingoflow/shared'
import { IGNORE_SELECTORS, isVisible } from './filters'

export const CONTENT_ROOT_SELECTORS = [
  'main',
  'article',
  '[role="main"]',
  '.markdown-body',
  '.prose',
  '#content',
  '#mw-content-text',
  '.mw-parser-output',
  '.md-content',
]

export type DiscoverContentRootsOptions = {
  contentRootSelectors?: string[]
  excludeSelectors?: string[]
  minRootTextLength?: number
  minRootParagraphCount?: number
  linkDensityPenalty?: number
}

export function discoverContentRoots(
  root: Document | HTMLElement,
  options: DiscoverContentRootsOptions = {},
): HTMLElement[] {
  const selectors = options.contentRootSelectors?.length
    ? options.contentRootSelectors
    : CONTENT_ROOT_SELECTORS
  const excludeSelectors = options.excludeSelectors?.length
    ? options.excludeSelectors
    : IGNORE_SELECTORS
  const explicitRoots = findFirstMatchingContentRoots(root, selectors, excludeSelectors)

  if (explicitRoots.length > 0) return explicitRoots

  const scoredRoots = scoreGenericContentRoots(root, {
    excludeSelectors,
    minRootTextLength: options.minRootTextLength,
    minRootParagraphCount: options.minRootParagraphCount,
    linkDensityPenalty: options.linkDensityPenalty,
  })
  if (scoredRoots.length > 0) return scoredRoots

  if (root instanceof Document) {
    if (root.body) return [root.body]
    return root.documentElement instanceof HTMLElement ? [root.documentElement] : []
  }

  return root instanceof HTMLElement ? [root] : []
}

function scoreGenericContentRoots(
  root: Document | HTMLElement,
  options: Required<Pick<DiscoverContentRootsOptions, 'excludeSelectors'>> & Omit<DiscoverContentRootsOptions, 'contentRootSelectors' | 'excludeSelectors'>,
): HTMLElement[] {
  const minTextLength = options.minRootTextLength ?? 80
  const minParagraphCount = options.minRootParagraphCount ?? 1
  const linkDensityPenalty = options.linkDensityPenalty ?? 400
  const candidates = queryElements(root, 'section, div')
    .filter((element): element is HTMLElement => element instanceof HTMLElement)
    .filter(element => isVisible(element))
    .filter(element => !matchesSelfOrClosest(element, options.excludeSelectors))
    .map(element => {
      const text = normalizeText(element.innerText || element.textContent || '')
      const paragraphs = element.querySelectorAll('p, li').length
      const linkText = Array.from(element.querySelectorAll('a'))
        .map(link => normalizeText((link as HTMLElement).innerText || link.textContent || '').length)
        .reduce((sum, length) => sum + length, 0)
      const linkDensity = text.length === 0 ? 0 : linkText / text.length
      return {
        element,
        score: text.length + paragraphs * 120 - linkDensity * linkDensityPenalty,
        textLength: text.length,
        paragraphs,
      }
    })
    .filter(candidate => candidate.textLength >= minTextLength && candidate.paragraphs >= minParagraphCount)
    .sort((a, b) => b.score - a.score)

  return candidates[0] ? [candidates[0].element] : []
}

function uniqueElements(elements: HTMLElement[]): HTMLElement[] {
  return [...new Set(elements)]
}

function findFirstMatchingContentRoots(
  root: Document | HTMLElement,
  selectors: string[],
  excludeSelectors: string[],
): HTMLElement[] {
  for (const selector of selectors) {
    const roots = uniqueElements(
      queryElements(root, selector)
        .filter((element): element is HTMLElement => element instanceof HTMLElement)
        .filter(element => isVisible(element))
        .filter(element => !matchesSelfOrClosest(element, excludeSelectors))
    )
    if (roots.length > 0) return roots
  }

  return []
}

function queryElements(root: Document | HTMLElement, selector: string): Element[] {
  const matches = Array.from(root.querySelectorAll(selector))
  if (root instanceof HTMLElement && root.matches(selector)) {
    matches.unshift(root)
  }
  return matches
}

function matchesSelfOrClosest(element: HTMLElement, selectors: string[]): boolean {
  const selector = selectors.join(',')
  if (!selector) return false
  return element.matches(selector) || !!element.closest(selector)
}
