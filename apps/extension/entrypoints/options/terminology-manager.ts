import { validateGlossary } from '@lingoflow/glossary'
import type {
  Glossary,
  GlossaryEntry,
  GlossaryValidationError,
} from '@lingoflow/types'

export const GLOSSARY_EXPORT_SCHEMA = 'lingoflow.glossaries.v1' as const

export type GlossaryExportDocument = {
  schema: typeof GLOSSARY_EXPORT_SCHEMA
  exportedAt: string
  glossaries: Glossary[]
}

export function createGlossary(
  existing: Glossary[],
  now = new Date().toISOString(),
): Glossary {
  return {
    id: nextId('terminology', new Set(existing.map(item => item.id))),
    name: 'Terminology',
    enabled: true,
    scope: {},
    entries: [],
    createdAt: now,
    updatedAt: now,
  }
}

export function createGlossaryEntry(existing: GlossaryEntry[]): GlossaryEntry {
  return {
    id: nextId('term', new Set(existing.map(item => item.id))),
    source: '',
    target: '',
    caseSensitive: false,
    match: 'term',
    enabled: true,
  }
}

export function validateGlossaries(glossaries: Glossary[]): GlossaryValidationError[] {
  return glossaries.flatMap((glossary, index) => {
    const existing = glossaries.filter((_, candidateIndex) => candidateIndex !== index)
    const validation = validateGlossary(glossary, existing)
    return validation.ok
      ? []
      : validation.errors.map(error => ({
          field: `glossaries.${index}.${error.field}`,
          message: error.message,
        }))
  })
}

export function exportGlossaries(
  glossaries: Glossary[],
  now = new Date().toISOString(),
): string {
  const document: GlossaryExportDocument = {
    schema: GLOSSARY_EXPORT_SCHEMA,
    exportedAt: now,
    glossaries: cloneJson(glossaries),
  }
  return `${JSON.stringify(document, null, 2)}\n`
}

export function importGlossaries(
  text: string,
  existing: Glossary[],
  now = new Date().toISOString(),
): Glossary[] {
  const document = JSON.parse(text) as Partial<GlossaryExportDocument>
  if (document.schema !== GLOSSARY_EXPORT_SCHEMA || !Array.isArray(document.glossaries)) {
    throw new Error('Unsupported terminology file.')
  }

  const ids = new Set(existing.map(item => item.id))
  const imported = document.glossaries.map(item => {
    const glossary = cloneJson(item)
    glossary.id = nextId(glossary.id || 'terminology', ids)
    ids.add(glossary.id)
    glossary.createdAt ||= now
    glossary.updatedAt = now
    return glossary
  })
  const result = [...cloneJson(existing), ...imported]
  const errors = validateGlossaries(result)
  if (errors.length > 0) {
    throw new Error(errors[0].message)
  }
  return result
}

export function parseScopeList(value: string): string[] | undefined {
  const items = [...new Set(
    value
      .split(/[,\n]/)
      .map(item => item.trim())
      .filter(Boolean),
  )]
  return items.length > 0 ? items : undefined
}

function nextId(base: string, used: Set<string>): string {
  const normalized = slugify(base)
  if (!used.has(normalized)) return normalized
  let suffix = 2
  while (used.has(`${normalized}-${suffix}`)) suffix += 1
  return `${normalized}-${suffix}`
}

function slugify(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '') || 'terminology'
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
