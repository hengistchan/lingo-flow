import type {
  PageRule,
  PageRuleBehavior,
  PageRuleSelectors,
  PageRuleThresholds,
  ResolvedPageRule,
} from '@lingoflow/types'

export type ResolvePageRuleOptions = {
  siteRules?: PageRule[]
  userRules?: PageRule[]
  overrides?: PageRule | PageRule[]
}

const DEFAULT_SELECTORS: Required<PageRuleSelectors> = {
  contentRoots: [
    'main',
    'article',
    '[role="main"]',
    '.markdown-body',
    '.prose',
    '#content',
    '#mw-content-text',
    '.mw-parser-output',
    '.md-content',
  ],
  blockSelectors: [
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'p',
    'div',
    'li',
    'blockquote',
    'td',
    'th',
    'dd',
    'figcaption',
  ],
  excludeSelectors: [
    'script',
    'style',
    'noscript',
    'template',
    'input',
    'textarea',
    'button',
    'select',
    'svg',
    'canvas',
    'pre',
    'code',
    '[contenteditable="true"]',
    '[translate="no"]',
    '.notranslate',
    '[data-lingoflow-ignore]',
    '[data-lingoflow-generated]',
    '[data-lingoflow-translation]',
  ],
  inlineSelectors: ['a', 'code', 'kbd', 'samp', 'var', 'sup', 'sub'],
  preserveSelectors: ['code', 'kbd', 'samp', 'var'],
  atomicBlockSelectors: ['pre', 'code', 'table'],
  stayOriginalSelectors: ['pre', 'code', 'kbd', 'samp', 'var'],
}

const DEFAULT_BEHAVIOR: Required<PageRuleBehavior> = {
  translationArea: 'main',
  startMode: 'manual',
  displayMode: 'dual',
  translationPosition: 'after',
  translationTheme: 'system',
  defaultInsertion: 'after-block',
}

const DEFAULT_THRESHOLDS: Required<PageRuleThresholds> = {
  minTextLength: 20,
  minWordCount: 0,
  maxInteractiveElements: 5,
  minRootTextLength: 80,
  minRootParagraphCount: 1,
  linkDensityPenalty: 400,
}

export const defaultPageRule: PageRule = {
  id: 'default',
  description: 'Default web reading surface rule',
  priority: 0,
  selectors: DEFAULT_SELECTORS,
  behavior: DEFAULT_BEHAVIOR,
  thresholds: DEFAULT_THRESHOLDS,
}

export function resolvePageRule(
  document: Document,
  url: string,
  options: ResolvePageRuleOptions = {},
): ResolvedPageRule {
  const matchingSiteRules = (options.siteRules ?? [])
    .filter(rule => matchesPageRule(rule, document, url))
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))

  const matchingUserRules = (options.userRules ?? [])
    .filter(rule => matchesPageRule(rule, document, url))

  const overrides = normalizeOverrides(options.overrides)
  const matchedRules = [
    defaultPageRule,
    ...matchingSiteRules,
    ...matchingUserRules,
    ...overrides,
  ]

  const resolved = matchedRules.reduce(mergeResolvedPageRule, emptyResolvedRule())
  return {
    ...resolved,
    id: resolved.matchedRuleIds.at(-1) ?? defaultPageRule.id,
  }
}

export function matchesPageRule(rule: PageRule, document: Document, url: string): boolean {
  const match = rule.match
  const matches = match?.matches ?? []
  const excludeMatches = match?.excludeMatches ?? []
  const selectorMatches = match?.selectorMatches ?? []
  const excludeSelectorMatches = match?.excludeSelectorMatches ?? []

  if (excludeMatches.some(pattern => matchesWildcardUrl(pattern, url))) return false
  if (matches.length > 0 && !matches.some(pattern => matchesWildcardUrl(pattern, url))) return false
  if (excludeSelectorMatches.some(selector => document.querySelector(selector))) return false
  if (selectorMatches.length > 0 && !selectorMatches.some(selector => document.querySelector(selector))) return false

  return true
}

export function matchesWildcardUrl(pattern: string, url: string): boolean {
  return wildcardUrlToRegExp(pattern).test(url)
}

function emptyResolvedRule(): ResolvedPageRule {
  return {
    id: defaultPageRule.id,
    matchedRuleIds: [],
    selectors: {
      contentRoots: [],
      blockSelectors: [],
      excludeSelectors: [],
      inlineSelectors: [],
      preserveSelectors: [],
      atomicBlockSelectors: [],
      stayOriginalSelectors: [],
    },
    behavior: {
      translationArea: 'main',
      startMode: 'manual',
      displayMode: 'dual',
      translationPosition: 'after',
      translationTheme: 'system',
      defaultInsertion: 'after-block',
    },
    thresholds: {
      minTextLength: 20,
      minWordCount: 0,
      maxInteractiveElements: 5,
      minRootTextLength: 80,
      minRootParagraphCount: 1,
      linkDensityPenalty: 400,
    },
  }
}

function mergeResolvedPageRule(resolved: ResolvedPageRule, rule: PageRule): ResolvedPageRule {
  return {
    id: rule.id,
    matchedRuleIds: [...resolved.matchedRuleIds, rule.id],
    selectors: mergeSelectors(resolved.selectors, rule.selectors ?? {}),
    behavior: {
      ...resolved.behavior,
      ...rule.behavior,
    },
    thresholds: {
      ...resolved.thresholds,
      ...rule.thresholds,
    },
  }
}

function mergeSelectors(
  current: Required<PageRuleSelectors>,
  incoming: PageRuleSelectors,
): Required<PageRuleSelectors> {
  return {
    contentRoots: mergeSelectorArray(incoming.contentRoots, current.contentRoots),
    blockSelectors: mergeSelectorArray(current.blockSelectors, incoming.blockSelectors),
    excludeSelectors: mergeSelectorArray(current.excludeSelectors, incoming.excludeSelectors),
    inlineSelectors: mergeSelectorArray(current.inlineSelectors, incoming.inlineSelectors),
    preserveSelectors: mergeSelectorArray(current.preserveSelectors, incoming.preserveSelectors),
    atomicBlockSelectors: mergeSelectorArray(current.atomicBlockSelectors, incoming.atomicBlockSelectors),
    stayOriginalSelectors: mergeSelectorArray(current.stayOriginalSelectors, incoming.stayOriginalSelectors),
  }
}

function mergeSelectorArray(...groups: Array<string[] | undefined>): string[] {
  const merged: string[] = []

  for (const group of groups) {
    for (const selector of group ?? []) {
      if (!merged.includes(selector)) merged.push(selector)
    }
  }

  return merged
}

function normalizeOverrides(overrides?: PageRule | PageRule[]): PageRule[] {
  if (!overrides) return []
  return Array.isArray(overrides) ? overrides : [overrides]
}

function wildcardUrlToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .split('*')
    .map(escapeRegExp)
    .join('.*')
  return new RegExp(`^${escaped}$`)
}

function escapeRegExp(input: string): string {
  return input.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
}
