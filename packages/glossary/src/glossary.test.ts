import type { Glossary } from '@lingoflow/types'
import {
  applyGlossary,
  createSemanticsFingerprint,
  hasLeakedGlossaryToken,
  resolveGlossary,
  restoreGlossaryTokens,
  validateGlossary,
} from './index'

const createdAt = '2026-07-25T00:00:00.000Z'

function glossary(overrides: Partial<Glossary> = {}): Glossary {
  return {
    id: 'ai-terms',
    name: 'AI terms',
    enabled: true,
    scope: {},
    entries: [
      {
        id: 'agent',
        source: 'AI agent',
        target: '智能体',
        sourceLang: 'en',
        targetLang: 'zh-Hans',
        caseSensitive: false,
        match: 'term',
        enabled: true,
      },
    ],
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  }
}

describe('glossary validation', () => {
  it('accepts a valid local glossary', () => {
    expect(validateGlossary(glossary())).toEqual({ ok: true })
  })

  it('rejects duplicate entries, invalid IDs, and invalid domain patterns', () => {
    const entry = glossary().entries[0]
    const result = validateGlossary(glossary({
      id: 'Bad ID',
      scope: { domains: ['https://example.com/docs'] },
      entries: [entry, { ...entry, id: 'agent-copy' }],
    }))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.map(error => error.field)).toEqual(
      expect.arrayContaining(['id', 'entries.1.source', 'scope.domains.0']),
    )
  })
})

describe('glossary resolution', () => {
  it('resolves enabled entries by domain, rule, and language', () => {
    const resolved = resolveGlossary([
      glossary({
        scope: { domains: ['*.example.com'], ruleIds: ['docs-page'] },
        entries: [
          glossary().entries[0],
          { ...glossary().entries[0], id: 'disabled', source: 'model', target: '模型', enabled: false },
          { ...glossary().entries[0], id: 'japanese', targetLang: 'ja', source: 'agent', target: 'エージェント' },
        ],
      }),
    ], {
      domain: 'docs.example.com',
      ruleIds: ['default', 'docs-page'],
      sourceLang: 'en',
      targetLang: 'zh-Hans',
    })

    expect(resolved.glossaryIds).toEqual(['ai-terms'])
    expect(resolved.entries.map(entry => entry.id)).toEqual(['agent'])
  })
})

describe('glossary application', () => {
  it('protects longest non-overlapping matches and restores configured targets', () => {
    const resolved = {
      glossaryIds: ['ai-terms'],
      entries: [
        glossary().entries[0],
        { ...glossary().entries[0], id: 'short-agent', source: 'agent', target: '代理' },
      ],
    }
    const applied = applyGlossary('An AI agent coordinates another agent.', resolved)

    expect(applied.requestText).toBe('An ⟦LFG:0⟧ coordinates another ⟦LFG:1⟧.')
    expect(applied.constraints.map(entry => entry.entryId)).toEqual(['agent', 'short-agent'])
    expect(applied.semanticsFingerprint).toMatch(/^g1-/)
    expect(restoreGlossaryTokens('一个⟦LFG：0⟧协调另一个⟦LFG:1⟧。', applied.tokens))
      .toBe('一个智能体协调另一个代理。')
  })

  it('does not match inside protected inline tokens or partial latin words', () => {
    const resolved = {
      glossaryIds: ['ai-terms'],
      entries: [{ ...glossary().entries[0], source: 'link', target: '链接' }],
    }
    const applied = applyGlossary('Blink ⟦LF:0⟧ link', resolved)

    expect(applied.requestText).toBe('Blink ⟦LF:0⟧ ⟦LFG:0⟧')
    expect(applied.tokens).toHaveLength(1)
  })

  it('generates a stable, order-independent semantics fingerprint', () => {
    const first = [
      { entryId: 'b', source: 'B', target: '乙' },
      { entryId: 'a', source: 'A', target: '甲' },
    ]
    expect(createSemanticsFingerprint(first)).toBe(
      createSemanticsFingerprint([...first].reverse()),
    )
    expect(createSemanticsFingerprint([])).toBeUndefined()
    expect(hasLeakedGlossaryToken('still ⟦LFG:1⟧')).toBe(true)
  })
})
