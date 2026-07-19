import type {
  PageRule,
  PageRuleBehavior,
  PageRuleSelectors,
  PageRuleThresholds,
  ResolvedPageRule,
  RuleValidationError,
  RuleValidationResult,
  UserSiteRule,
} from '@lingoflow/types'

import { SITE_RULES, wikipediaRule, githubRule, docsPageRule } from './site-rules'
export { SITE_RULES, wikipediaRule, githubRule, docsPageRule }

export type ResolvePageRuleOptions = {
  siteRules?: PageRule[]
  userRules?: UserSiteRule[]
  overrides?: PageRule | PageRule[]
}

const VALID_ID_RE = /^(?:user:)?[a-z0-9][a-z0-9._-]*$/

const VALID_BEHAVIOR_ENUMS: Record<keyof PageRuleBehavior, Set<string>> = {
  translationArea: new Set(['main', 'body', 'selection']),
  startMode: new Set(['manual', 'dynamic', 'immediate']),
  displayMode: new Set(['original', 'dual', 'translation']),
  translationPosition: new Set(['after', 'before']),
  translationTheme: new Set(['system', 'light', 'dark']),
  defaultInsertion: new Set([
    'linebreak-inside',
    'inline-inside',
    'inside-container',
    'before-nested-structure',
    'after-block',
  ]),
}

const THRESHOLD_LIMITS: Record<keyof PageRuleThresholds, { min: number; max: number }> = {
  minTextLength: { min: 1, max: 10000 },
  minWordCount: { min: 0, max: 10000 },
  maxInteractiveElements: { min: 0, max: 1000 },
  minRootTextLength: { min: 0, max: 100000 },
  minRootParagraphCount: { min: 0, max: 1000 },
  linkDensityPenalty: { min: 0, max: 10000 },
}

export function validateUserRule(
  rule: UserSiteRule,
  existingRules: UserSiteRule[] = [],
  builtinIds: Set<string> = getBuiltinIds(),
): RuleValidationResult {
  const errors: RuleValidationError[] = []

  if (!VALID_ID_RE.test(rule.id)) {
    errors.push({
      field: 'id',
      message: 'Rule ID must be lowercase, may use the internal user: prefix, and otherwise contain only letters, numbers, dots, underscores, and hyphens',
    })
  }

  const existingIds = new Set(existingRules.map(r => r.id))
  if (existingIds.has(rule.id)) {
    errors.push({ field: 'id', message: `Duplicate user rule ID: "${rule.id}"` })
  }

  const hasUrlMatch =
    (rule.match?.matches?.length ?? 0) > 0 ||
    (rule.match?.excludeMatches?.length ?? 0) > 0
  const hasSelectorMatch =
    (rule.match?.selectorMatches?.length ?? 0) > 0 ||
    (rule.match?.excludeSelectorMatches?.length ?? 0) > 0

  if (!hasUrlMatch && !hasSelectorMatch) {
    errors.push({
      field: 'match',
      message: 'User rule must have at least one URL pattern or selector match',
    })
  }

  if (rule.match?.matches) {
    for (const pattern of rule.match.matches) {
      try {
        wildcardUrlToRegExp(pattern)
      } catch {
        errors.push({ field: 'match.matches', message: `Invalid URL pattern: "${pattern}"` })
      }
    }
  }

  if (rule.match?.excludeMatches) {
    for (const pattern of rule.match.excludeMatches) {
      try {
        wildcardUrlToRegExp(pattern)
      } catch {
        errors.push({ field: 'match.excludeMatches', message: `Invalid URL pattern: "${pattern}"` })
      }
    }
  }

  if (rule.selectors) {
    const selectorFields: Array<keyof PageRuleSelectors> = [
      'contentRoots',
      'blockSelectors',
      'excludeSelectors',
      'inlineSelectors',
      'preserveSelectors',
      'atomicBlockSelectors',
      'stayOriginalSelectors',
    ]
    for (const field of selectorFields) {
      const selectors = rule.selectors[field] as string[] | undefined
      if (selectors) {
        for (const selector of selectors) {
          if (!isValidSelector(selector)) {
            errors.push({
              field: `selectors.${field}`,
              message: `Invalid selector: "${selector}"`,
            })
          }
        }
      }
    }
  }

  if (rule.match?.selectorMatches) {
    for (const selector of rule.match.selectorMatches) {
      if (!isValidSelector(selector)) {
        errors.push({
          field: 'match.selectorMatches',
          message: `Invalid selector: "${selector}"`,
        })
      }
    }
  }

  if (rule.match?.excludeSelectorMatches) {
    for (const selector of rule.match.excludeSelectorMatches) {
      if (!isValidSelector(selector)) {
        errors.push({
          field: 'match.excludeSelectorMatches',
          message: `Invalid selector: "${selector}"`,
        })
      }
    }
  }

  if (rule.thresholds) {
    for (const [key, value] of Object.entries(rule.thresholds)) {
      if (value === undefined) continue
      const limits = THRESHOLD_LIMITS[key as keyof PageRuleThresholds]
      if (!limits) continue
      if (!Number.isFinite(value) || value < limits.min || value > limits.max) {
        errors.push({
          field: `thresholds.${key}`,
          message: `Threshold "${key}" must be a finite number between ${limits.min} and ${limits.max}`,
        })
      }
    }
  }

  if (rule.behavior) {
    for (const [key, value] of Object.entries(rule.behavior)) {
      if (value === undefined) continue
      const validValues = VALID_BEHAVIOR_ENUMS[key as keyof PageRuleBehavior]
      if (validValues && !validValues.has(value as string)) {
        errors.push({
          field: `behavior.${key}`,
          message: `Unknown behavior value "${value}" for "${key}"`,
        })
      }
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors }
}

export function namespaceUserRuleId(id: string, builtinIds: Set<string> = getBuiltinIds()): string {
  if (builtinIds.has(id) && !id.startsWith('user:')) {
    return `user:${id}`
  }
  return id
}

function getBuiltinIds(): Set<string> {
  return new Set(SITE_RULES.map(r => r.id))
}

const DEFAULT_SELECTORS: Required<PageRuleSelectors> = {
  contentRoots: [
    'main',
    'article',
    '[role="main"]',
    '.prose',
    '#content',
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
  const builtinIds = getBuiltinIds()

  const matchingSiteRules = (options.siteRules ?? [])
    .filter(rule => matchesPageRule(rule, document, url))
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))

  const matchingUserRules = (options.userRules ?? [])
    .filter(rule => rule.enabled !== false)
    .filter(rule => {
      const namespaced = namespaceUserRuleId(rule.id, builtinIds)
      const effectiveRule = namespaced === rule.id ? rule : { ...rule, id: namespaced }
      return matchesPageRule(effectiveRule, document, url)
    })
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
    .map(rule => {
      const namespaced = namespaceUserRuleId(rule.id, builtinIds)
      return namespaced === rule.id ? rule : { ...rule, id: namespaced }
    })

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
    contentRoots: mergePrepend(incoming.contentRoots, current.contentRoots),
    blockSelectors: mergeDedupe(current.blockSelectors, incoming.blockSelectors),
    excludeSelectors: mergeDedupe(current.excludeSelectors, incoming.excludeSelectors),
    inlineSelectors: mergeDedupe(current.inlineSelectors, incoming.inlineSelectors),
    preserveSelectors: mergeDedupe(current.preserveSelectors, incoming.preserveSelectors),
    atomicBlockSelectors: mergeDedupe(current.atomicBlockSelectors, incoming.atomicBlockSelectors),
    stayOriginalSelectors: mergeDedupe(current.stayOriginalSelectors, incoming.stayOriginalSelectors),
  }
}

function mergePrepend(incoming: string[] | undefined, existing: string[]): string[] {
  const result = [...(incoming ?? [])]
  for (const selector of existing) {
    if (!result.includes(selector)) {
      result.push(selector)
    }
  }
  return result
}

function mergeDedupe(existing: string[], incoming: string[] | undefined): string[] {
  const result = [...existing]
  for (const selector of incoming ?? []) {
    if (!result.includes(selector)) {
      result.push(selector)
    }
  }
  return result
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

function isValidSelector(selector: string): boolean {
  if (typeof document === 'undefined' || !document.createDocumentFragment) {
    return selector.trim().length > 0
  }
  try {
    const fragment = document.createDocumentFragment()
    fragment.querySelector(selector)
    return true
  } catch {
    return false
  }
}
