import type {
  AppliedGlossary,
  Glossary,
  GlossaryEntry,
  GlossaryToken,
  GlossaryValidationError,
  GlossaryValidationResult,
  TranslationConstraint,
} from '@lingoflow/types'

const VALID_ID_RE = /^[a-z0-9][a-z0-9._-]*$/
const RESERVED_TOKEN_RE = /⟦LF[:：]\d+⟧/g

export type GlossaryResolutionContext = {
  domain: string
  ruleIds: string[]
  sourceLang: string
  targetLang: string
}

export type ResolvedGlossary = {
  glossaryIds: string[]
  entries: GlossaryEntry[]
}

type MatchCandidate = {
  entry: GlossaryEntry
  start: number
  end: number
}

export function validateGlossary(
  glossary: Glossary,
  existingGlossaries: Glossary[] = [],
): GlossaryValidationResult {
  const errors: GlossaryValidationError[] = []

  if (!VALID_ID_RE.test(glossary.id)) {
    errors.push({
      field: 'id',
      message: 'Glossary ID must use lower-case letters, numbers, dots, underscores, or hyphens.',
    })
  }
  if (existingGlossaries.some(item => item.id === glossary.id)) {
    errors.push({ field: 'id', message: `Glossary ID "${glossary.id}" already exists.` })
  }
  if (!glossary.name.trim()) {
    errors.push({ field: 'name', message: 'Glossary name is required.' })
  }
  if (!Array.isArray(glossary.entries)) {
    errors.push({ field: 'entries', message: 'Glossary entries must be an array.' })
    return { ok: false, errors }
  }

  const entryIds = new Set<string>()
  const entryPairs = new Set<string>()
  glossary.entries.forEach((entry, index) => {
    const prefix = `entries.${index}`
    if (!VALID_ID_RE.test(entry.id)) {
      errors.push({ field: `${prefix}.id`, message: 'Entry ID is invalid.' })
    } else if (entryIds.has(entry.id)) {
      errors.push({ field: `${prefix}.id`, message: `Duplicate entry ID "${entry.id}".` })
    }
    entryIds.add(entry.id)

    if (!entry.source.trim()) {
      errors.push({ field: `${prefix}.source`, message: 'Source term is required.' })
    }
    if (!entry.target.trim()) {
      errors.push({ field: `${prefix}.target`, message: 'Target term is required.' })
    }
    if (entry.match !== 'term' && entry.match !== 'exact') {
      errors.push({ field: `${prefix}.match`, message: 'Match mode must be "term" or "exact".' })
    }

    const pairKey = [
      entry.caseSensitive ? entry.source.trim() : entry.source.trim().toLocaleLowerCase(),
      entry.sourceLang ?? '*',
      entry.targetLang ?? '*',
      entry.match,
    ].join('\u0000')
    if (entryPairs.has(pairKey)) {
      errors.push({ field: `${prefix}.source`, message: 'Duplicate source term and language scope.' })
    }
    entryPairs.add(pairKey)
  })

  for (const [index, pattern] of (glossary.scope.domains ?? []).entries()) {
    if (!isValidDomainPattern(pattern)) {
      errors.push({ field: `scope.domains.${index}`, message: `Invalid domain pattern "${pattern}".` })
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors }
}

export function resolveGlossary(
  glossaries: Glossary[],
  context: GlossaryResolutionContext,
): ResolvedGlossary {
  const matched = glossaries
    .filter(glossary => glossary.enabled)
    .filter(glossary => matchesScope(glossary, context))
    .sort((left, right) => left.id.localeCompare(right.id))

  const entries = matched
    .flatMap(glossary => glossary.entries)
    .filter(entry => entry.enabled)
    .filter(entry => matchesLanguage(entry.sourceLang, context.sourceLang))
    .filter(entry => matchesLanguage(entry.targetLang, context.targetLang))
    .sort(compareEntries)

  return {
    glossaryIds: matched.map(glossary => glossary.id),
    entries: dedupeEntries(entries),
  }
}

export function applyGlossary(
  requestText: string,
  resolved: ResolvedGlossary,
): AppliedGlossary {
  if (resolved.entries.length === 0 || requestText.length === 0) {
    return {
      requestText,
      constraints: [],
      tokens: [],
      glossaryIds: resolved.glossaryIds,
    }
  }

  const reservedRanges = findReservedTokenRanges(requestText)
  const candidates = resolved.entries.flatMap(entry =>
    findEntryMatches(requestText, entry)
      .filter(candidate => !reservedRanges.some(range => overlaps(candidate, range))),
  )
  const selected = selectNonOverlappingMatches(candidates)

  if (selected.length === 0) {
    return {
      requestText,
      constraints: [],
      tokens: [],
      glossaryIds: resolved.glossaryIds,
    }
  }

  const tokens: GlossaryToken[] = selected.map((match, index) => ({
    id: `⟦LFG:${index}⟧`,
    entryId: match.entry.id,
    source: requestText.slice(match.start, match.end),
    target: match.entry.target,
  }))
  let protectedText = requestText
  for (let index = selected.length - 1; index >= 0; index -= 1) {
    protectedText =
      protectedText.slice(0, selected[index].start) +
      tokens[index].id +
      protectedText.slice(selected[index].end)
  }

  const constraints = dedupeConstraints(
    selected.map(match => ({
      entryId: match.entry.id,
      source: match.entry.source,
      target: match.entry.target,
    })),
  )

  return {
    requestText: protectedText,
    constraints,
    tokens,
    glossaryIds: resolved.glossaryIds,
    semanticsFingerprint: createSemanticsFingerprint(constraints),
  }
}

export function restoreGlossaryTokens(text: string, tokens: GlossaryToken[] = []): string {
  const normalized = text.replace(/⟦LFG：/g, '⟦LFG:')
  return tokens.reduce(
    (value, token) => value.split(token.id).join(token.target),
    normalized,
  )
}

export function hasLeakedGlossaryToken(text: string): boolean {
  return /⟦LFG[:：]\d+⟧/.test(text)
}

export function createSemanticsFingerprint(constraints: TranslationConstraint[]): string | undefined {
  if (constraints.length === 0) return undefined
  const serialized = [...constraints]
    .sort((left, right) =>
      left.entryId.localeCompare(right.entryId) ||
      left.source.localeCompare(right.source) ||
      left.target.localeCompare(right.target),
    )
    .map(item => `${item.entryId}\u0000${item.source}\u0000${item.target}`)
    .join('\u0001')
  return `g1-${fnv1a(serialized)}`
}

function matchesScope(glossary: Glossary, context: GlossaryResolutionContext): boolean {
  const domains = glossary.scope.domains ?? []
  const ruleIds = glossary.scope.ruleIds ?? []
  const domainMatches = domains.length === 0 || domains.some(pattern => matchesDomain(pattern, context.domain))
  const ruleMatches = ruleIds.length === 0 || ruleIds.some(id => context.ruleIds.includes(id))
  return domainMatches && ruleMatches
}

function matchesDomain(pattern: string, domain: string): boolean {
  const normalizedPattern = pattern.trim().toLocaleLowerCase()
  const normalizedDomain = domain.trim().toLocaleLowerCase()
  if (normalizedPattern === '*') return true
  if (normalizedPattern.startsWith('*.')) {
    const suffix = normalizedPattern.slice(2)
    return normalizedDomain === suffix || normalizedDomain.endsWith(`.${suffix}`)
  }
  return normalizedDomain === normalizedPattern
}

function isValidDomainPattern(pattern: string): boolean {
  const normalized = pattern.trim().toLocaleLowerCase()
  if (normalized === '*') return true
  const withoutWildcard = normalized.startsWith('*.') ? normalized.slice(2) : normalized
  return (
    withoutWildcard.length > 0 &&
    withoutWildcard.length <= 253 &&
    !withoutWildcard.includes('://') &&
    withoutWildcard.split('.').every(label =>
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label),
    )
  )
}

function matchesLanguage(expected: string | undefined, actual: string): boolean {
  return !expected || expected === 'auto' || actual === 'auto' || expected === actual
}

function compareEntries(left: GlossaryEntry, right: GlossaryEntry): number {
  return right.source.length - left.source.length || left.id.localeCompare(right.id)
}

function dedupeEntries(entries: GlossaryEntry[]): GlossaryEntry[] {
  const seen = new Set<string>()
  return entries.filter(entry => {
    const key = [
      entry.caseSensitive ? entry.source : entry.source.toLocaleLowerCase(),
      entry.target,
      entry.match,
    ].join('\u0000')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function findEntryMatches(text: string, entry: GlossaryEntry): MatchCandidate[] {
  const source = entry.source.trim()
  if (!source) return []

  const haystack = entry.caseSensitive ? text : text.toLocaleLowerCase()
  const needle = entry.caseSensitive ? source : source.toLocaleLowerCase()
  if (entry.match === 'exact') {
    const leading = text.match(/^\s*/)?.[0].length ?? 0
    const trailing = text.match(/\s*$/)?.[0].length ?? 0
    const end = text.length - trailing
    return haystack.slice(leading, end) === needle
      ? [{ entry, start: leading, end }]
      : []
  }

  const matches: MatchCandidate[] = []
  let fromIndex = 0
  while (fromIndex <= haystack.length - needle.length) {
    const start = haystack.indexOf(needle, fromIndex)
    if (start < 0) break
    const end = start + needle.length
    if (hasValidTermBoundary(text, source, start, end)) {
      matches.push({ entry, start, end })
    }
    fromIndex = start + Math.max(needle.length, 1)
  }
  return matches
}

function hasValidTermBoundary(text: string, source: string, start: number, end: number): boolean {
  if (!/[A-Za-z0-9]/.test(source)) return true
  const before = start > 0 ? text[start - 1] : ''
  const after = end < text.length ? text[end] : ''
  return !isLatinWordCharacter(before) && !isLatinWordCharacter(after)
}

function isLatinWordCharacter(value: string): boolean {
  return /[A-Za-z0-9_]/.test(value)
}

function findReservedTokenRanges(text: string): Array<{ start: number; end: number }> {
  return Array.from(text.matchAll(RESERVED_TOKEN_RE), match => ({
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }))
}

function overlaps(
  left: { start: number; end: number },
  right: { start: number; end: number },
): boolean {
  return left.start < right.end && right.start < left.end
}

function selectNonOverlappingMatches(candidates: MatchCandidate[]): MatchCandidate[] {
  const selected: MatchCandidate[] = []
  for (const candidate of [...candidates].sort((left, right) =>
    left.start - right.start ||
    (right.end - right.start) - (left.end - left.start) ||
    left.entry.id.localeCompare(right.entry.id),
  )) {
    if (selected.some(existing => overlaps(candidate, existing))) continue
    selected.push(candidate)
  }
  return selected.sort((left, right) => left.start - right.start)
}

function dedupeConstraints(constraints: TranslationConstraint[]): TranslationConstraint[] {
  const seen = new Set<string>()
  return constraints.filter(constraint => {
    const key = `${constraint.entryId}\u0000${constraint.source}\u0000${constraint.target}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}
