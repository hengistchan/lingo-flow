import type { PageRule } from '@lingoflow/types'
import { defaultPageRule, resolvePageRule } from './index'

describe('page rule resolution', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
  })

  it('matches wildcard URLs and gives exclude patterns priority', () => {
    const rule: PageRule = {
      id: 'wiki',
      match: {
        matches: ['*://*.wikipedia.org/*'],
        excludeMatches: ['*://*.wikipedia.org/wiki/Special:*'],
      },
      selectors: {
        contentRoots: ['#mw-content-text'],
      },
    }

    const included = resolvePageRule(document, 'https://en.wikipedia.org/wiki/LingoFlow', {
      siteRules: [rule],
    })
    const excluded = resolvePageRule(document, 'https://en.wikipedia.org/wiki/Special:Random', {
      siteRules: [rule],
    })

    expect(included.matchedRuleIds).toContain('wiki')
    expect(included.selectors.contentRoots[0]).toBe('#mw-content-text')
    expect(excluded.matchedRuleIds).not.toContain('wiki')
  })

  it('requires selector matches and honors selector excludes', () => {
    const rule: PageRule = {
      id: 'github-markdown',
      match: {
        matches: ['*://github.com/*'],
        selectorMatches: ['.markdown-body'],
        excludeSelectorMatches: ['[data-private-repo="true"]'],
      },
      selectors: {
        blockSelectors: ['.markdown-body p'],
      },
    }

    document.body.innerHTML = '<main class="markdown-body"><p>Readable markdown body content.</p></main>'
    const matched = resolvePageRule(document, 'https://github.com/org/repo', {
      siteRules: [rule],
    })

    document.body.innerHTML = '<main class="markdown-body" data-private-repo="true"></main>'
    const excluded = resolvePageRule(document, 'https://github.com/org/repo', {
      siteRules: [rule],
    })

    expect(matched.matchedRuleIds).toContain('github-markdown')
    expect(matched.selectors.blockSelectors).toContain('.markdown-body p')
    expect(excluded.matchedRuleIds).not.toContain('github-markdown')
  })

  it('merges default, prioritized site rules, user rules, and temporary overrides without mutating inputs', () => {
    const lowPriorityRule: PageRule = {
      id: 'docs-base',
      priority: 1,
      match: { matches: ['https://example.com/docs/*'] },
      selectors: {
        contentRoots: ['article'],
        blockSelectors: ['p', '.doc-block'],
        excludeSelectors: ['.ad'],
      },
      behavior: {
        displayMode: 'dual',
        defaultInsertion: 'after-block',
      },
      thresholds: {
        minTextLength: 24,
      },
    }
    const highPriorityRule: PageRule = {
      id: 'docs-specific',
      priority: 10,
      match: { matches: ['https://example.com/docs/special/*'] },
      selectors: {
        contentRoots: ['.special-doc'],
        blockSelectors: ['.doc-block', '.special-block'],
      },
      behavior: {
        displayMode: 'translation',
      },
    }
    const userRule: PageRule = {
      id: 'user-docs',
      match: { matches: ['https://example.com/docs/*'] },
      selectors: {
        contentRoots: ['#reader'],
        excludeSelectors: ['.sponsor', '.ad'],
      },
      thresholds: {
        minTextLength: 12,
      },
    }
    const override: PageRule = {
      id: 'runtime-selection',
      selectors: {
        contentRoots: ['#selection-root'],
      },
      behavior: {
        translationArea: 'selection',
      },
    }
    const originalLowPriorityRule = structuredClone(lowPriorityRule)
    const originalUserRule = structuredClone(userRule)

    const resolved = resolvePageRule(document, 'https://example.com/docs/special/page', {
      siteRules: [highPriorityRule, lowPriorityRule],
      userRules: [userRule],
      overrides: [override],
    })

    expect(resolved.id).toBe('runtime-selection')
    expect(resolved.matchedRuleIds).toEqual([
      defaultPageRule.id,
      'docs-base',
      'docs-specific',
      'user-docs',
      'runtime-selection',
    ])
    expect(resolved.selectors.contentRoots.slice(0, 4)).toEqual([
      '#selection-root',
      '#reader',
      '.special-doc',
      'article',
    ])
    expect(resolved.selectors.blockSelectors.filter(selector => selector === '.doc-block')).toHaveLength(1)
    expect(resolved.selectors.blockSelectors).toEqual(expect.arrayContaining(['p', '.doc-block', '.special-block']))
    expect(resolved.selectors.excludeSelectors).toEqual(expect.arrayContaining(['.ad', '.sponsor']))
    expect(resolved.behavior.displayMode).toBe('translation')
    expect(resolved.behavior.translationArea).toBe('selection')
    expect(resolved.thresholds.minTextLength).toBe(12)
    expect(lowPriorityRule).toEqual(originalLowPriorityRule)
    expect(userRule).toEqual(originalUserRule)
  })
})
