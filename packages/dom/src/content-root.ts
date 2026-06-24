import type { RootDiagnostic } from '@lingoflow/types'
import { normalizeText } from '@lingoflow/shared'
import { IGNORE_SELECTORS, INTERACTIVE_SELECTORS, isGeneratedByLingoFlow, isVisible } from './filters'

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

const GENERIC_ROOT_SELECTORS = [
  'main',
  'article',
  '[role="main"]',
  'section',
  'div',
  '.markdown-body',
  '.comment-body',
]

const SHELL_TAGS = new Set(['main', 'body'])
const SHELL_SELECTORS = [
  'nav',
  'aside',
  'header',
  'footer',
  '[role="navigation"]',
  '[role="complementary"]',
  '.sidebar',
  '.toc',
  '.navbox',
  '.infobox',
  '.menu',
  '.toolbar',
]

export type DiscoverContentRootsOptions = {
  contentRootSelectors?: string[]
  excludeSelectors?: string[]
  minRootTextLength?: number
  minRootParagraphCount?: number
  linkDensityPenalty?: number
  maxSelectedRoots?: number
}

export type ContentRootDiscoveryResult = {
  roots: HTMLElement[]
  diagnostics: {
    considered: RootDiagnostic[]
    selected: RootDiagnostic[]
    rejected: RootDiagnostic[]
  }
}

type RootSource = NonNullable<RootDiagnostic['source']>

type RootMetrics = NonNullable<RootDiagnostic['metrics']>

type RootCandidate = {
  element: HTMLElement
  source: RootSource
  sourceSelector: string
  selectorIndex: number
  metrics: RootMetrics
  score: number
  documentIndex: number
}

export function discoverContentRoots(
  root: Document | HTMLElement,
  options: DiscoverContentRootsOptions = {},
): ContentRootDiscoveryResult {
  const explicitSelectors = options.contentRootSelectors?.length
    ? options.contentRootSelectors
    : CONTENT_ROOT_SELECTORS
  const explicitSource: RootSource = options.contentRootSelectors?.length ? 'rule' : 'default'
  const excludeSelectors = options.excludeSelectors?.length
    ? options.excludeSelectors
    : IGNORE_SELECTORS
  const minTextLength = options.minRootTextLength ?? 80
  const minParagraphCount = options.minRootParagraphCount ?? 1
  const maxSelectedRoots = options.maxSelectedRoots ?? 12

  const candidateMap = new Map<HTMLElement, RootCandidate>()
  collectCandidates(root, explicitSelectors, explicitSource, candidateMap)
  collectCandidates(root, GENERIC_ROOT_SELECTORS, 'generic', candidateMap)

  const considered: RootDiagnostic[] = []
  const rejected: RootDiagnostic[] = []
  const eligible: RootCandidate[] = []

  for (const candidate of [...candidateMap.values()].sort(compareDocumentOrderCandidates)) {
    considered.push(createRootDiagnostic(candidate, false))

    const rejectReason = getRootRejectReason(candidate, {
      excludeSelectors,
      minTextLength,
      minParagraphCount,
    })
    if (rejectReason) {
      rejected.push(createRootDiagnostic(candidate, false, rejectReason))
      continue
    }

    eligible.push(candidate)
  }

  const boundedEligible = applyPreferredSelectorBoundary(eligible, explicitSelectors, rejected)
  const selectedCandidates = selectRootCandidates(boundedEligible, maxSelectedRoots, rejected)
  const selected = selectedCandidates.map((candidate, index) =>
    createRootDiagnostic(candidate, true, undefined, index + 1),
  )

  if (selectedCandidates.length > 0) {
    return {
      roots: selectedCandidates.map(candidate => candidate.element),
      diagnostics: { considered, selected, rejected },
    }
  }

  const fallback = getFallbackRoots(root)
  const fallbackDiagnostics = fallback.map((element, index) =>
    createRootDiagnostic(createFallbackCandidate(element, index), true, undefined, index + 1),
  )

  return {
    roots: fallback,
    diagnostics: {
      considered: [...considered, ...fallbackDiagnostics],
      selected: fallbackDiagnostics,
      rejected,
    },
  }
}

function collectCandidates(
  root: Document | HTMLElement,
  selectors: string[],
  source: RootSource,
  candidates: Map<HTMLElement, RootCandidate>,
): void {
  selectors.forEach((selector, selectorIndex) => {
    for (const element of queryElements(root, selector)) {
      if (!(element instanceof HTMLElement)) continue

      const existing = candidates.get(element)
      const next = createCandidate(element, source, selector, selectorIndex)
      if (!existing || compareSourcePriority(next, existing) < 0) {
        candidates.set(element, next)
      }
    }
  })
}

function createCandidate(
  element: HTMLElement,
  source: RootSource,
  sourceSelector: string,
  selectorIndex: number,
): RootCandidate {
  const metrics = measureRoot(element)
  return {
    element,
    source,
    sourceSelector,
    selectorIndex,
    metrics,
    score: scoreRoot(element, source, selectorIndex, metrics),
    documentIndex: getDocumentIndex(element),
  }
}

function createFallbackCandidate(element: HTMLElement, documentIndex: number): RootCandidate {
  const metrics = measureRoot(element)
  return {
    element,
    source: 'fallback',
    sourceSelector: element.tagName.toLowerCase(),
    selectorIndex: Number.MAX_SAFE_INTEGER,
    metrics,
    score: 0,
    documentIndex,
  }
}

function measureRoot(element: HTMLElement): RootMetrics {
  const text = normalizeText(element.innerText || element.textContent || '')
  const linkTextLength = Array.from(element.querySelectorAll('a'))
    .map(link => normalizeText((link as HTMLElement).innerText || link.textContent || '').length)
    .reduce((sum, length) => sum + length, 0)
  const interactiveCount = element.querySelectorAll(INTERACTIVE_SELECTORS.join(',')).length
  const descendantCount = element.querySelectorAll('*').length
  const rect = element.getBoundingClientRect?.()
  const visibleArea = rect ? Math.max(0, rect.width) * Math.max(0, rect.height) : 0

  return {
    textLength: text.length,
    normalizedTextLength: text.length,
    paragraphCount: element.querySelectorAll('p').length,
    headingCount: element.querySelectorAll('h1,h2,h3,h4,h5,h6').length,
    listItemCount: element.querySelectorAll('li').length,
    tableCount: element.querySelectorAll('table,td,th').length,
    linkTextLength,
    linkDensity: text.length === 0 ? 0 : linkTextLength / text.length,
    interactiveCount,
    interactiveDensity: descendantCount === 0 ? 0 : interactiveCount / descendantCount,
    visibleArea,
    depth: getDepth(element),
    generated: isGeneratedByLingoFlow(element),
  }
}

function scoreRoot(
  element: HTMLElement,
  source: RootSource,
  selectorIndex: number,
  metrics: RootMetrics,
): number {
  const sourceBoost = source === 'rule' ? 260 : source === 'default' ? 180 : 0
  const selectorBoost = Math.max(0, 80 - selectorIndex * 8)
  const semanticBoost = getSemanticBoost(element)
  const visibleBoost = Math.min(metrics.visibleArea / 8000, 80)
  const shellPenalty = getShellPenalty(element, metrics)

  const rawScore =
    Math.min(metrics.normalizedTextLength, 3200) +
    metrics.paragraphCount * 160 +
    metrics.headingCount * 130 +
    metrics.listItemCount * 35 +
    metrics.tableCount * 35 +
    sourceBoost +
    selectorBoost +
    semanticBoost +
    visibleBoost -
    metrics.linkDensity * 900 -
    metrics.interactiveDensity * 700 -
    metrics.depth * 8 -
    shellPenalty

  return Math.round(rawScore)
}

function getSemanticBoost(element: HTMLElement): number {
  const tagName = element.tagName.toLowerCase()
  if (tagName === 'article') return 320
  if (tagName === 'main') return 180
  if (element.getAttribute('role') === 'main') return 180
  if (element.classList.contains('markdown-body')) return 130
  if (tagName === 'section') return 90
  return 0
}

function getShellPenalty(element: HTMLElement, metrics: RootMetrics): number {
  const tagName = element.tagName.toLowerCase()
  let penalty = 0

  if (SHELL_TAGS.has(tagName) && element.querySelector('article,section,.markdown-body')) {
    penalty += 480
  }
  if (element.querySelector(SHELL_SELECTORS.join(','))) {
    penalty += 180
  }
  if (metrics.paragraphCount === 0 && metrics.headingCount === 0 && metrics.listItemCount > 4) {
    penalty += 260
  }

  return penalty
}

function getRootRejectReason(
  candidate: RootCandidate,
  options: {
    excludeSelectors: string[]
    minTextLength: number
    minParagraphCount: number
  },
): string | undefined {
  if (!isVisible(candidate.element)) return 'not-visible'
  if (candidate.metrics.generated) return 'generated-node'
  if (matchesSelfOrClosest(candidate.element, options.excludeSelectors)) return 'inside-exclude-selector'
  if (
    candidate.metrics.linkDensity >= 0.68 &&
    candidate.metrics.linkTextLength >= 40 &&
    candidate.metrics.paragraphCount === 0 &&
    candidate.metrics.headingCount === 0
  ) {
    return 'high-link-density'
  }
  if (candidate.metrics.interactiveCount >= 3 && candidate.metrics.interactiveDensity >= 0.45) {
    return 'high-interactive-density'
  }
  if (isPreferredRootHint(candidate) && candidate.metrics.normalizedTextLength >= 20 && getReadableUnitCount(candidate.metrics) >= 1) {
    return undefined
  }
  if (candidate.metrics.normalizedTextLength < options.minTextLength) return 'content-root-threshold'
  if (getReadableUnitCount(candidate.metrics) < options.minParagraphCount) return 'content-root-threshold'
  return undefined
}

function applyPreferredSelectorBoundary(
  candidates: RootCandidate[],
  explicitSelectors: string[],
  rejected: RootDiagnostic[],
): RootCandidate[] {
  const firstSelector = explicitSelectors[0]
  if (!firstSelector || CONTENT_ROOT_SELECTORS.includes(firstSelector)) return candidates

  const preferred = candidates.filter(candidate =>
    candidate.source !== 'generic' && candidate.selectorIndex === 0 && candidate.sourceSelector === firstSelector
  )
  if (preferred.length === 0) return candidates

  return candidates.filter(candidate => {
    const insidePreferredBoundary = preferred.some(boundary =>
      boundary.element === candidate.element ||
      boundary.element.contains(candidate.element) ||
      candidate.element.contains(boundary.element)
    )
    if (!insidePreferredBoundary) {
      rejected.push(createRootDiagnostic(candidate, false, 'outside-preferred-root'))
    }
    return insidePreferredBoundary
  })
}

function selectRootCandidates(
  candidates: RootCandidate[],
  maxSelectedRoots: number,
  rejected: RootDiagnostic[],
): RootCandidate[] {
  const selected: RootCandidate[] = []
  const ranked = [...candidates].sort(compareRankCandidates)

  for (const candidate of ranked) {
    const duplicate = selected.find(existing => existing.element === candidate.element)
    if (duplicate) continue

    const nestedSelection = selected.find(existing =>
      existing.element.contains(candidate.element) || candidate.element.contains(existing.element)
    )

    if (nestedSelection) {
      if (shouldReplaceNestedSelection(candidate, nestedSelection)) {
        removeSelected(selected, nestedSelection)
        rejected.push(createRootDiagnostic(nestedSelection, false, getNestedRejectReason(nestedSelection, candidate)))
        selected.push(candidate)
        continue
      }

      rejected.push(createRootDiagnostic(candidate, false, getNestedRejectReason(candidate, nestedSelection)))
      continue
    }

    selected.push(candidate)
    if (selected.length >= maxSelectedRoots) break
  }

  return selected.sort(compareDocumentOrderCandidates)
}

function shouldReplaceNestedSelection(candidate: RootCandidate, existing: RootCandidate): boolean {
  if (candidate.element.contains(existing.element)) {
    return isCustomFirstRootHint(candidate)
  }
  if (!existing.element.contains(candidate.element)) return false

  const existingTag = existing.element.tagName.toLowerCase()
  const candidateTag = candidate.element.tagName.toLowerCase()
  if (existingTag === 'article') return false
  if (hasDirectReadableChildren(existing.element)) return false
  if (candidateTag === 'article') return true
  if (candidate.score >= existing.score * 0.72 && isShellLike(existing)) return true
  return candidate.score > existing.score + 300
}

function isPreferredRootHint(candidate: RootCandidate): boolean {
  if (candidate.source === 'generic') return false
  if (isCustomFirstRootHint(candidate)) return true
  const tagName = candidate.element.tagName.toLowerCase()
  return tagName === 'main' || tagName === 'article' || candidate.element.getAttribute('role') === 'main'
}

function isCustomFirstRootHint(candidate: RootCandidate): boolean {
  return candidate.source !== 'generic' &&
    candidate.selectorIndex === 0 &&
    !CONTENT_ROOT_SELECTORS.includes(candidate.sourceSelector)
}

function hasDirectReadableChildren(element: HTMLElement): boolean {
  return Array.from(element.children).some(child => {
    if (!(child instanceof HTMLElement)) return false
    const tagName = child.tagName.toLowerCase()
    if (!/^(p|h[1-6]|li|blockquote|td|th|dd|figcaption)$/.test(tagName)) return false
    return normalizeText(child.innerText || child.textContent || '').length >= 20
  })
}

function isShellLike(candidate: RootCandidate): boolean {
  const tagName = candidate.element.tagName.toLowerCase()
  return SHELL_TAGS.has(tagName) || candidate.element.querySelectorAll('article,section,.markdown-body').length > 1
}

function getNestedRejectReason(candidate: RootCandidate, selected: RootCandidate): string {
  if (selected.element.contains(candidate.element)) return 'deduped-by-selected-parent'
  if (candidate.element.contains(selected.element)) return 'deduped-by-selected-child'
  return 'deduped-by-overlap'
}

function removeSelected(selected: RootCandidate[], candidate: RootCandidate): void {
  const index = selected.indexOf(candidate)
  if (index >= 0) selected.splice(index, 1)
}

function createRootDiagnostic(
  candidate: RootCandidate,
  isSelected: boolean,
  rejectReason?: string,
  rank?: number,
): RootDiagnostic {
  const element = candidate.element
  const tagName = element.tagName.toLowerCase()
  const id = element.id || undefined
  const classes = element.className && typeof element.className === 'string'
    ? element.className.trim() || undefined
    : undefined
  const selector = getSuggestedSelector(element)
  const diagnostic: RootDiagnostic = {
    selector,
    tagName,
    id,
    classes,
    selected: isSelected,
    rejectReason,
    source: candidate.source,
    sourceSelector: candidate.sourceSelector,
    score: candidate.score,
    rank,
    metrics: candidate.metrics,
    suggestedSelector: selector,
  }

  if (rejectReason?.startsWith('deduped-by-')) {
    diagnostic.dedupeReason = rejectReason
  }

  return diagnostic
}

function getSuggestedSelector(element: HTMLElement): string {
  const tagName = element.tagName.toLowerCase()
  if (element.id) return `#${cssEscape(element.id)}`

  const stableClass = Array.from(element.classList).find(className =>
    /^[A-Za-z_-][\w-]*$/.test(className) && !/^(active|selected|open|show|hide|hidden)$/i.test(className)
  )
  if (stableClass) return `${tagName}.${cssEscape(stableClass)}`

  const role = element.getAttribute('role')
  if (role) return `${tagName}[role="${role}"]`

  return tagName
}

function getReadableUnitCount(metrics: RootMetrics): number {
  return metrics.paragraphCount + metrics.headingCount + metrics.listItemCount + metrics.tableCount
}

function compareRankCandidates(a: RootCandidate, b: RootCandidate): number {
  if (b.score !== a.score) return b.score - a.score
  return compareDocumentOrderCandidates(a, b)
}

function compareDocumentOrderCandidates(a: RootCandidate, b: RootCandidate): number {
  return a.documentIndex - b.documentIndex
}

function compareSourcePriority(a: RootCandidate, b: RootCandidate): number {
  const sourcePriority: Record<RootSource, number> = {
    rule: 0,
    default: 1,
    generic: 2,
    fallback: 3,
  }
  if (sourcePriority[a.source] !== sourcePriority[b.source]) {
    return sourcePriority[a.source] - sourcePriority[b.source]
  }
  return a.selectorIndex - b.selectorIndex
}

function uniqueElements(elements: HTMLElement[]): HTMLElement[] {
  return [...new Set(elements)]
}

function queryElements(root: Document | HTMLElement, selector: string): Element[] {
  const matches = Array.from(root.querySelectorAll(selector))
  if (root instanceof HTMLElement && root.matches(selector)) {
    matches.unshift(root)
  }
  return uniqueElements(matches.filter((element): element is HTMLElement => element instanceof HTMLElement))
}

function matchesSelfOrClosest(element: HTMLElement, selectors: string[]): boolean {
  const selector = selectors.join(',')
  if (!selector) return false
  return element.matches(selector) || !!element.closest(selector)
}

function getFallbackRoots(root: Document | HTMLElement): HTMLElement[] {
  if (isDocumentLike(root)) {
    if (root.body) return [root.body]
    if (root.documentElement instanceof HTMLElement) return [root.documentElement]
    return []
  }
  if (root instanceof HTMLElement) return [root]

  const queryableRoot = root as ParentNode
  const fallbackSelector = 'main,article,[role="main"],section,div,p,li,td,th,dd,figcaption'
  if (typeof queryableRoot.querySelectorAll === 'function') {
    return Array.from(queryableRoot.querySelectorAll(fallbackSelector))
      .filter((element): element is HTMLElement => element instanceof HTMLElement)
  }

  return []
}

function isDocumentLike(root: unknown): root is Document {
  return !!root && typeof root === 'object' && (root as Document).nodeType === 9
}

function getDepth(element: HTMLElement): number {
  let depth = 0
  let current: Element | null = element
  while (current.parentElement) {
    depth += 1
    current = current.parentElement
  }
  return depth
}

function getDocumentIndex(element: HTMLElement): number {
  const document = element.ownerDocument
  const allElements = Array.from(document.querySelectorAll('*'))
  const index = allElements.indexOf(element)
  return index >= 0 ? index : 0
}

function cssEscape(value: string): string {
  const css = globalThis.CSS as { escape?: (input: string) => string } | undefined
  if (css?.escape) return css.escape(value)
  return value.replace(/[^A-Za-z0-9_-]/g, '\\$&')
}
