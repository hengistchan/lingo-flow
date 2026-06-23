import type { RootDiagnostic } from '@lingoflow/types'
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

export type ContentRootDiscoveryResult = {
  roots: HTMLElement[]
  diagnostics: {
    considered: RootDiagnostic[]
    selected: RootDiagnostic[]
    rejected: RootDiagnostic[]
  }
}

export function discoverContentRoots(
  root: Document | HTMLElement,
  options: DiscoverContentRootsOptions = {},
): ContentRootDiscoveryResult {
  const selectors = options.contentRootSelectors?.length
    ? options.contentRootSelectors
    : CONTENT_ROOT_SELECTORS
  const excludeSelectors = options.excludeSelectors?.length
    ? options.excludeSelectors
    : IGNORE_SELECTORS

  const considered: RootDiagnostic[] = []
  const selected: RootDiagnostic[] = []
  const rejected: RootDiagnostic[] = []

  const explicitResult = findFirstMatchingContentRoots(root, selectors, excludeSelectors, considered, rejected)

  if (explicitResult.length > 0) {
    for (const el of explicitResult) {
      selected.push(createRootDiagnostic(el, true))
    }
    return {
      roots: explicitResult,
      diagnostics: { considered, selected, rejected },
    }
  }

  const scoredResult = scoreGenericContentRoots(root, {
    excludeSelectors,
    minRootTextLength: options.minRootTextLength,
    minRootParagraphCount: options.minRootParagraphCount,
    linkDensityPenalty: options.linkDensityPenalty,
    considered,
    rejected,
  })
  if (scoredResult.length > 0) {
    for (const el of scoredResult) {
      selected.push(createRootDiagnostic(el, true))
    }
    return {
      roots: scoredResult,
      diagnostics: { considered, selected, rejected },
    }
  }

  let fallback: HTMLElement[] = []
  if (root instanceof Document) {
    if (root.body) fallback = [root.body]
    else if (root.documentElement instanceof HTMLElement) fallback = [root.documentElement]
  } else if (root instanceof HTMLElement) {
    fallback = [root]
  }

  for (const el of fallback) {
    const diag = createRootDiagnostic(el, true)
    diag.rejectReason = undefined
    selected.push(diag)
    considered.push(diag)
  }

  return {
    roots: fallback,
    diagnostics: { considered, selected, rejected },
  }
}

function createRootDiagnostic(element: HTMLElement, isSelected: boolean, rejectReason?: string): RootDiagnostic {
  const tagName = element.tagName.toLowerCase()
  const id = element.id || undefined
  const classes = element.className && typeof element.className === 'string'
    ? element.className.trim() || undefined
    : undefined
  const selector = id ? `#${id}` : classes ? `${tagName}.${classes.split(/\s+/)[0]}` : tagName
  return { selector, tagName, id, classes, selected: isSelected, rejectReason }
}

function scoreGenericContentRoots(
  root: Document | HTMLElement,
  options: Required<Pick<DiscoverContentRootsOptions, 'excludeSelectors'>> &
    Omit<DiscoverContentRootsOptions, 'contentRootSelectors' | 'excludeSelectors'> & {
      considered: RootDiagnostic[]
      rejected: RootDiagnostic[]
    },
): HTMLElement[] {
  const minTextLength = options.minRootTextLength ?? 80
  const minParagraphCount = options.minRootParagraphCount ?? 1
  const linkDensityPenalty = options.linkDensityPenalty ?? 400
  const candidates = queryElements(root, 'section, div')
    .filter((element): element is HTMLElement => element instanceof HTMLElement)
    .filter(element => {
      if (!isVisible(element)) {
        options.rejected.push(createRootDiagnostic(element, false, 'not-visible'))
        return false
      }
      if (matchesSelfOrClosest(element, options.excludeSelectors)) {
        options.rejected.push(createRootDiagnostic(element, false, 'inside-exclude-selector'))
        return false
      }
      return true
    })
    .map(element => {
      const text = normalizeText(element.innerText || element.textContent || '')
      const paragraphs = element.querySelectorAll('p, li').length
      const linkText = Array.from(element.querySelectorAll('a'))
        .map(link => normalizeText((link as HTMLElement).innerText || link.textContent || '').length)
        .reduce((sum, length) => sum + length, 0)
      const linkDensity = text.length === 0 ? 0 : linkText / text.length
      options.considered.push(createRootDiagnostic(element, false))
      return {
        element,
        score: text.length + paragraphs * 120 - linkDensity * linkDensityPenalty,
        textLength: text.length,
        paragraphs,
      }
    })
    .filter(candidate => {
      if (candidate.textLength < minTextLength) {
        options.rejected.push(createRootDiagnostic(candidate.element, false, 'content-root-threshold'))
        return false
      }
      if (candidate.paragraphs < minParagraphCount) {
        options.rejected.push(createRootDiagnostic(candidate.element, false, 'content-root-threshold'))
        return false
      }
      return true
    })
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
  considered: RootDiagnostic[],
  rejected: RootDiagnostic[],
): HTMLElement[] {
  for (const selector of selectors) {
    const allMatching = queryElements(root, selector)
      .filter((element): element is HTMLElement => element instanceof HTMLElement)

    const roots = uniqueElements(
      allMatching
        .filter(element => {
          considered.push(createRootDiagnostic(element, false))
          if (!isVisible(element)) {
            rejected.push(createRootDiagnostic(element, false, 'not-visible'))
            return false
          }
          if (matchesSelfOrClosest(element, excludeSelectors)) {
            rejected.push(createRootDiagnostic(element, false, 'inside-exclude-selector'))
            return false
          }
          return true
        })
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
