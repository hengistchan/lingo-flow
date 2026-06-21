import type { PageRule } from '@lingoflow/types'
import { defaultPageRule, resolvePageRule } from './index'
import { SITE_RULES, wikipediaRule, githubRule } from './site-rules'

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

describe('site rules registry', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
  })

  it('matches Wikipedia URL to the wikipedia site rule', () => {
    document.body.innerHTML = '<div id="mw-content-text"><p>Article content</p></div>'
    const resolved = resolvePageRule(document, 'https://en.wikipedia.org/wiki/LingoFlow', {
      siteRules: SITE_RULES,
    })

    expect(resolved.matchedRuleIds).toContain('wikipedia')
    expect(resolved.selectors.contentRoots).toContain('#mw-content-text')
    expect(resolved.selectors.contentRoots).toContain('.mw-parser-output')
  })

  it('matches GitHub URL to the github site rule', () => {
    document.body.innerHTML = '<main class="markdown-body"><p>README content</p></main>'
    const resolved = resolvePageRule(document, 'https://github.com/org/repo', {
      siteRules: SITE_RULES,
    })

    expect(resolved.matchedRuleIds).toContain('github')
    expect(resolved.selectors.contentRoots).toContain('.markdown-body')
    expect(resolved.selectors.contentRoots).toContain('.md-content')
  })

  it('excludes Wikipedia Special: and Talk: pages', () => {
    document.body.innerHTML = '<div id="mw-content-text"><p>Special page</p></div>'
    const special = resolvePageRule(document, 'https://en.wikipedia.org/wiki/Special:Random', {
      siteRules: SITE_RULES,
    })
    const talk = resolvePageRule(document, 'https://en.wikipedia.org/wiki/Talk:LingoFlow', {
      siteRules: SITE_RULES,
    })

    expect(special.matchedRuleIds).not.toContain('wikipedia')
    expect(talk.matchedRuleIds).not.toContain('wikipedia')
  })

  it('merges site rule selectors into the resolved rule', () => {
    document.body.innerHTML = '<div id="mw-content-text"><p>Content</p></div>'
    const resolved = resolvePageRule(document, 'https://en.wikipedia.org/wiki/Test', {
      siteRules: SITE_RULES,
    })

    expect(resolved.selectors.contentRoots[0]).toBe('#mw-content-text')
    expect(resolved.selectors.contentRoots).toContain('.mw-parser-output')
    expect(resolved.selectors.blockSelectors).toEqual(expect.arrayContaining(['h1', 'p']))
    expect(resolved.selectors.excludeSelectors).toEqual(expect.arrayContaining(['script', 'style']))
  })

  it('site rules take priority over default rule but are overridden by user rules', () => {
    document.body.innerHTML = '<div id="mw-content-text"><p>Content</p></div>'
    const userRule: PageRule = {
      id: 'user-wiki',
      match: { matches: ['*://*.wikipedia.org/*'] },
      selectors: {
        contentRoots: ['#custom-root'],
      },
    }

    const resolved = resolvePageRule(document, 'https://en.wikipedia.org/wiki/Test', {
      siteRules: SITE_RULES,
      userRules: [userRule],
    })

    expect(resolved.matchedRuleIds).toEqual([
      defaultPageRule.id,
      'wikipedia',
      'user-wiki',
    ])
    expect(resolved.selectors.contentRoots[0]).toBe('#custom-root')
    expect(resolved.selectors.contentRoots).toContain('#mw-content-text')
  })
})
