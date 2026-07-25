import type { RuleSelectionResult, UserSiteRule } from '@lingoflow/types'
import { buildInteractiveRule } from './site-adaptation'

const selection: RuleSelectionResult = {
  kind: 'content-root',
  pageUrl: 'https://docs.example.com/guide/start',
  domain: 'docs.example.com',
  element: {
    tagName: 'main',
    textPreview: 'Guide content',
  },
  candidates: [{
    selector: 'main.docs',
    strategy: 'semantic-class',
    matchCount: 1,
    stabilityScore: 84,
    warnings: [],
  }],
}

describe('interactive user-rule drafts', () => {
  it('creates a scoped content-root rule with local provenance', () => {
    expect(buildInteractiveRule({
      selection,
      selector: 'main.docs',
      existingRules: [],
      now: '2026-07-25T00:00:00.000Z',
    })).toMatchObject({
      id: 'adapt-docs.example.com',
      match: { matches: ['https://docs.example.com/*'] },
      selectors: { contentRoots: ['main.docs'] },
      provenance: {
        kind: 'interactive',
        selectedSelector: 'main.docs',
        selectionKind: 'content-root',
      },
    })
  })

  it('creates placement intent separately and avoids persisted ID collisions', () => {
    const existing = [{
      ...buildInteractiveRule({
        selection,
        selector: 'main.docs',
        existingRules: [],
        now: '2026-07-25T00:00:00.000Z',
      }),
      id: 'adapt-docs.example.com',
    }] satisfies UserSiteRule[]

    const rule = buildInteractiveRule({
      selection: { ...selection, kind: 'placement' },
      selector: 'main.docs',
      translationPosition: 'before',
      existingRules: existing,
      now: '2026-07-25T00:00:00.000Z',
    })

    expect(rule.id).toBe('adapt-docs.example.com-2')
    expect(rule.selectors).toEqual({})
    expect(rule.match?.selectorMatches).toEqual(['main.docs'])
    expect(rule.behavior?.translationPosition).toBe('before')
  })
})
