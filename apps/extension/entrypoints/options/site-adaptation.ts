import type {
  RuleSelectionResult,
  TranslationPosition,
  UserSiteRule,
} from '@lingoflow/types'

export function buildInteractiveRule(input: {
  selection: RuleSelectionResult
  selector: string
  existingRules: UserSiteRule[]
  translationPosition?: TranslationPosition
  now?: string
}): UserSiteRule {
  const now = input.now ?? new Date().toISOString()
  const baseId = `adapt-${slugify(input.selection.domain || 'site')}`
  const id = nextAvailableId(baseId, new Set(input.existingRules.map(rule => rule.id)))
  const originPattern = createOriginPattern(input.selection.pageUrl)
  const selectors =
    input.selection.kind === 'content-root'
      ? { contentRoots: [input.selector] }
      : input.selection.kind === 'exclude'
        ? { excludeSelectors: [input.selector] }
        : {}

  return {
    id,
    version: 1,
    source: 'user',
    enabled: true,
    priority: 70,
    description: descriptionFor(input.selection.kind, input.selection.domain),
    createdAt: now,
    updatedAt: now,
    match: {
      matches: [originPattern],
      ...(input.selection.kind === 'placement'
        ? { selectorMatches: [input.selector] }
        : {}),
    },
    selectors,
    ...(input.selection.kind === 'placement'
      ? {
          behavior: {
            translationPosition: input.translationPosition ?? 'after',
          },
        }
      : {}),
    provenance: {
      kind: 'interactive',
      pageUrl: input.selection.pageUrl,
      selectedSelector: input.selector,
      selectionKind: input.selection.kind,
    },
  }
}

function createOriginPattern(pageUrl: string): string {
  try {
    return `${new URL(pageUrl).origin}/*`
  } catch {
    return '*://*/*'
  }
}

function nextAvailableId(base: string, existingIds: Set<string>): string {
  if (!existingIds.has(base) && !existingIds.has(`user:${base}`)) return base
  let suffix = 2
  while (existingIds.has(`${base}-${suffix}`) || existingIds.has(`user:${base}-${suffix}`)) {
    suffix += 1
  }
  return `${base}-${suffix}`
}

function slugify(value: string): string {
  const normalized = value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || 'site'
}

function descriptionFor(kind: RuleSelectionResult['kind'], domain: string): string {
  if (kind === 'exclude') return `Keep selected ${domain} content untranslated`
  if (kind === 'placement') return `Place translations around the selected ${domain} reading area`
  return `Use the selected ${domain} reading area as main content`
}
