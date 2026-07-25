export type GlossaryMatchMode = 'term' | 'exact'

export type GlossaryEntry = {
  id: string
  source: string
  target: string
  sourceLang?: string
  targetLang?: string
  caseSensitive: boolean
  match: GlossaryMatchMode
  enabled: boolean
}

export type GlossaryScope = {
  domains?: string[]
  ruleIds?: string[]
}

export type Glossary = {
  id: string
  name: string
  enabled: boolean
  scope: GlossaryScope
  entries: GlossaryEntry[]
  createdAt: string
  updatedAt: string
}

export type GlossaryValidationError = {
  field: string
  message: string
}

export type GlossaryValidationResult =
  | { ok: true }
  | { ok: false; errors: GlossaryValidationError[] }

export type TranslationConstraint = {
  entryId: string
  source: string
  target: string
}

export type GlossaryToken = {
  id: string
  entryId: string
  source: string
  target: string
}

export type AppliedGlossary = {
  requestText: string
  constraints: TranslationConstraint[]
  tokens: GlossaryToken[]
  glossaryIds: string[]
  semanticsFingerprint?: string
}
