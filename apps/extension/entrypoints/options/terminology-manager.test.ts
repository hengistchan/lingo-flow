import { describe, expect, it } from 'vitest'
import type { Glossary } from '@lingoflow/types'
import {
  createGlossary,
  createGlossaryEntry,
  exportGlossaries,
  importGlossaries,
  parseScopeList,
  validateGlossaries,
} from './terminology-manager'

const NOW = '2026-07-25T00:00:00.000Z'

describe('terminology manager', () => {
  it('creates stable unique IDs for glossaries and entries', () => {
    const first = createGlossary([], NOW)
    const second = createGlossary([first], NOW)
    expect([first.id, second.id]).toEqual(['terminology', 'terminology-2'])
    expect([
      createGlossaryEntry([]).id,
      createGlossaryEntry([createGlossaryEntry([])]).id,
    ]).toEqual(['term', 'term-2'])
  })

  it('validates duplicate IDs and incomplete entries', () => {
    const first = glossary('product')
    const second = glossary('product')
    second.entries.push({
      id: 'broken',
      source: '',
      target: '',
      caseSensitive: false,
      match: 'term',
      enabled: true,
    })
    expect(validateGlossaries([first, second]).map(error => error.message)).toEqual(
      expect.arrayContaining([
        'Glossary ID "product" already exists.',
        'Source term is required.',
        'Target term is required.',
      ]),
    )
  })

  it('exports and imports without overwriting existing IDs', () => {
    const serialized = exportGlossaries([glossary('product')], NOW)
    const imported = importGlossaries(serialized, [glossary('product')], NOW)
    expect(imported.map(item => item.id)).toEqual(['product', 'product-2'])
    expect(imported[1].updatedAt).toBe(NOW)
  })

  it('normalizes comma and newline separated scope values', () => {
    expect(parseScopeList('docs.example.com, *.example.org\ndocs.example.com')).toEqual([
      'docs.example.com',
      '*.example.org',
    ])
    expect(parseScopeList('  ')).toBeUndefined()
  })
})

function glossary(id: string): Glossary {
  return {
    id,
    name: 'Product terms',
    enabled: true,
    scope: {},
    entries: [],
    createdAt: NOW,
    updatedAt: NOW,
  }
}
