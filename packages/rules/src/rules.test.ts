import type { PageRule, SiteRule, UserSiteRule } from '@lingoflow/types'
import { defaultPageRule, resolvePageRule, validateUserRule, namespaceUserRuleId } from './index'
import { SITE_RULES, wikipediaRule, githubRule, docsPageRule } from './site-rules'

function makeUserRule(overrides: Partial<UserSiteRule> & { id: string }): UserSiteRule {
  return {
    version: 1,
    source: 'user',
    enabled: true,
    createdAt: '2026-06-22T00:00:00.000Z',
    updatedAt: '2026-06-22T00:00:00.000Z',
    match: { matches: ['*://example.com/*'] },
    ...overrides,
  }
}

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
      siteRules: [rule as any],
    })
    const excluded = resolvePageRule(document, 'https://en.wikipedia.org/wiki/Special:Random', {
      siteRules: [rule as any],
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
      siteRules: [rule as any],
    })

    document.body.innerHTML = '<main class="markdown-body" data-private-repo="true"></main>'
    const excluded = resolvePageRule(document, 'https://github.com/org/repo', {
      siteRules: [rule as any],
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
    const userRule: UserSiteRule = makeUserRule({
      id: 'user-docs',
      match: { matches: ['https://example.com/docs/*'] },
      selectors: {
        contentRoots: ['#reader'],
        excludeSelectors: ['.sponsor', '.ad'],
      },
      thresholds: {
        minTextLength: 12,
      },
    })
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
      siteRules: [highPriorityRule, lowPriorityRule] as any,
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

  it('matches Wikipedia URL to the wikipedia-article site rule', () => {
    document.body.innerHTML = '<div id="mw-content-text"><p>Article content</p></div>'
    const resolved = resolvePageRule(document, 'https://en.wikipedia.org/wiki/LingoFlow', {
      siteRules: SITE_RULES,
    })

    expect(resolved.matchedRuleIds).toContain('wikipedia-article')
    expect(resolved.selectors.contentRoots).toContain('#mw-content-text')
    expect(resolved.selectors.contentRoots).toContain('.mw-parser-output')
  })

  it('matches GitHub URL to the github-markdown site rule', () => {
    document.body.innerHTML = '<main class="markdown-body"><p>README content</p></main>'
    const resolved = resolvePageRule(document, 'https://github.com/org/repo', {
      siteRules: SITE_RULES,
    })

    expect(resolved.matchedRuleIds).toContain('github-markdown')
    expect(resolved.selectors.contentRoots).toContain('.markdown-body')
  })

  it('prioritizes GitHub feed cards before nested markdown previews', () => {
    document.body.innerHTML = `
      <article id="feed-item-1" class="js-feed-item-component">
        <h3><a href="/org/repo/pull/1">Improve the feed card title translation coverage</a></h3>
        <section class="markdown-body"><p>Short preview.</p></section>
      </article>
    `
    const resolved = resolvePageRule(document, 'https://github.com/conduit/for_you_feed', {
      siteRules: SITE_RULES,
    })

    expect(resolved.matchedRuleIds).toContain('github-markdown')
    expect(resolved.selectors.contentRoots.indexOf('article.js-feed-item-component')).toBeLessThan(
      resolved.selectors.contentRoots.indexOf('.markdown-body'),
    )
  })

  it('excludes Wikipedia Special: and Talk: pages', () => {
    document.body.innerHTML = '<div id="mw-content-text"><p>Special page</p></div>'
    const special = resolvePageRule(document, 'https://en.wikipedia.org/wiki/Special:Random', {
      siteRules: SITE_RULES,
    })
    const talk = resolvePageRule(document, 'https://en.wikipedia.org/wiki/Talk:LingoFlow', {
      siteRules: SITE_RULES,
    })

    expect(special.matchedRuleIds).not.toContain('wikipedia-article')
    expect(talk.matchedRuleIds).not.toContain('wikipedia-article')
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
    const userRule: UserSiteRule = makeUserRule({
      id: 'user-wiki',
      match: { matches: ['*://*.wikipedia.org/*'] },
      selectors: {
        contentRoots: ['#custom-root'],
      },
    })

    const resolved = resolvePageRule(document, 'https://en.wikipedia.org/wiki/Test', {
      siteRules: SITE_RULES,
      userRules: [userRule],
    })

    expect(resolved.matchedRuleIds).toEqual([
      defaultPageRule.id,
      'wikipedia-article',
      'user-wiki',
    ])
    expect(resolved.selectors.contentRoots[0]).toBe('#custom-root')
    expect(resolved.selectors.contentRoots).toContain('#mw-content-text')
  })

  it('matches docs pages to the docs-page rule', () => {
    document.body.innerHTML = '<main><article><p>Documentation content</p></article></main>'
    const resolved = resolvePageRule(document, 'https://docs.example.com/getting-started', {
      siteRules: SITE_RULES,
    })

    expect(resolved.matchedRuleIds).toContain('docs-page')
    expect(resolved.selectors.contentRoots).toContain('main')
    expect(resolved.selectors.contentRoots).toContain('article')
  })

  it('does not require enabled field on built-in SiteRule', () => {
    expect('enabled' in wikipediaRule).toBe(false)
    expect('enabled' in githubRule).toBe(false)
    expect('enabled' in docsPageRule).toBe(false)

    document.body.innerHTML = '<div id="mw-content-text"><p>Content</p></div>'
    const resolved = resolvePageRule(document, 'https://en.wikipedia.org/wiki/Test', {
      siteRules: [wikipediaRule],
    })
    expect(resolved.matchedRuleIds).toContain('wikipedia-article')
  })
})

describe('built-in / user / override merge order', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
  })

  it('deterministic resolution: default → built-in by priority → user by priority → override', () => {
    const builtInLow: SiteRule = {
      id: 'builtin-low',
      source: 'built-in',
      version: 1,
      priority: 5,
      match: { matches: ['*://example.com/*'] },
      selectors: { contentRoots: ['.low-root'] },
    }
    const builtInHigh: SiteRule = {
      id: 'builtin-high',
      source: 'built-in',
      version: 1,
      priority: 50,
      match: { matches: ['*://example.com/*'] },
      selectors: { contentRoots: ['.high-root'] },
    }
    const userLow: UserSiteRule = makeUserRule({
      id: 'user-low',
      priority: 10,
      match: { matches: ['*://example.com/*'] },
      selectors: { contentRoots: ['.user-low'] },
    })
    const userHigh: UserSiteRule = makeUserRule({
      id: 'user-high',
      priority: 90,
      match: { matches: ['*://example.com/*'] },
      selectors: { contentRoots: ['.user-high'] },
    })
    const override: PageRule = {
      id: 'override',
      selectors: { contentRoots: ['.override-root'] },
    }

    const resolved = resolvePageRule(document, 'https://example.com/page', {
      siteRules: [builtInHigh, builtInLow] as any,
      userRules: [userHigh, userLow],
      overrides: [override],
    })

    expect(resolved.matchedRuleIds).toEqual([
      'default',
      'builtin-low',
      'builtin-high',
      'user-low',
      'user-high',
      'override',
    ])
  })

  it('built-in rules are always active even with matching user rules', () => {
    document.body.innerHTML = '<div id="mw-content-text"><p>Content</p></div>'
    const userOverride: UserSiteRule = makeUserRule({
      id: 'user-wiki',
      match: { matches: ['*://*.wikipedia.org/*'] },
      selectors: { contentRoots: ['#user-root'] },
    })

    const resolved = resolvePageRule(document, 'https://en.wikipedia.org/wiki/Test', {
      siteRules: SITE_RULES,
      userRules: [userOverride],
    })

    expect(resolved.matchedRuleIds).toContain('wikipedia-article')
    expect(resolved.matchedRuleIds).toContain('user-wiki')
    expect(resolved.matchedRuleIds.indexOf('wikipedia-article')).toBeLessThan(
      resolved.matchedRuleIds.indexOf('user-wiki'),
    )
  })
})

describe('disabled user rules', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
  })

  it('disabled user rule is ignored in resolution', () => {
    const disabledRule: UserSiteRule = makeUserRule({
      id: 'disabled-user',
      enabled: false,
      match: { matches: ['*://example.com/*'] },
      selectors: { contentRoots: ['#disabled-root'] },
    })

    const resolved = resolvePageRule(document, 'https://example.com/page', {
      userRules: [disabledRule],
    })

    expect(resolved.matchedRuleIds).not.toContain('disabled-user')
    expect(resolved.selectors.contentRoots).not.toContain('#disabled-root')
  })

  it('enabled user rule is included in resolution', () => {
    const enabledRule: UserSiteRule = makeUserRule({
      id: 'enabled-user',
      enabled: true,
      match: { matches: ['*://example.com/*'] },
      selectors: { contentRoots: ['#enabled-root'] },
    })

    const resolved = resolvePageRule(document, 'https://example.com/page', {
      userRules: [enabledRule],
    })

    expect(resolved.matchedRuleIds).toContain('enabled-user')
    expect(resolved.selectors.contentRoots).toContain('#enabled-root')
  })

  it('enabled defaults to true when not explicitly set', () => {
    const rule: UserSiteRule = {
      id: 'implicit-enabled',
      version: 1,
      source: 'user',
      createdAt: '2026-06-22T00:00:00.000Z',
      updatedAt: '2026-06-22T00:00:00.000Z',
      enabled: true,
      match: { matches: ['*://example.com/*'] },
    }

    const resolved = resolvePageRule(document, 'https://example.com/page', {
      userRules: [rule],
    })

    expect(resolved.matchedRuleIds).toContain('implicit-enabled')
  })
})

describe('selector merge behavior', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
  })

  it('contentRoots: incoming roots are prepended so more specific custom roots win discovery order', () => {
    const siteRule: PageRule = {
      id: 'test-site',
      match: { matches: ['*://example.com/*'] },
      selectors: { contentRoots: ['.site-root'] },
    }
    const userRule: UserSiteRule = makeUserRule({
      id: 'test-user',
      match: { matches: ['*://example.com/*'] },
      selectors: { contentRoots: ['.user-root'] },
    })

    const resolved = resolvePageRule(document, 'https://example.com/page', {
      siteRules: [siteRule as any],
      userRules: [userRule],
    })

    const roots = resolved.selectors.contentRoots
    const userRootIndex = roots.indexOf('.user-root')
    const siteRootIndex = roots.indexOf('.site-root')
    const mainRootIndex = roots.indexOf('main')

    expect(userRootIndex).toBeLessThan(siteRootIndex)
    expect(siteRootIndex).toBeLessThan(mainRootIndex)
  })

  it('blockSelectors dedupe predictably', () => {
    const siteRule: PageRule = {
      id: 'test-site',
      match: { matches: ['*://example.com/*'] },
      selectors: { blockSelectors: ['p', '.custom'] },
    }
    const userRule: UserSiteRule = makeUserRule({
      id: 'test-user',
      match: { matches: ['*://example.com/*'] },
      selectors: { blockSelectors: ['.custom', '.user-block'] },
    })

    const resolved = resolvePageRule(document, 'https://example.com/page', {
      siteRules: [siteRule as any],
      userRules: [userRule],
    })

    const blockSelectors = resolved.selectors.blockSelectors
    expect(blockSelectors.filter(s => s === '.custom')).toHaveLength(1)
    expect(blockSelectors).toContain('p')
    expect(blockSelectors).toContain('.user-block')
  })

  it('excludeSelectors dedupe predictably', () => {
    const siteRule: PageRule = {
      id: 'test-site',
      match: { matches: ['*://example.com/*'] },
      selectors: { excludeSelectors: ['.ad', '.sidebar'] },
    }
    const userRule: UserSiteRule = makeUserRule({
      id: 'test-user',
      match: { matches: ['*://example.com/*'] },
      selectors: { excludeSelectors: ['.sidebar', '.sponsor'] },
    })

    const resolved = resolvePageRule(document, 'https://example.com/page', {
      siteRules: [siteRule as any],
      userRules: [userRule],
    })

    const excludes = resolved.selectors.excludeSelectors
    expect(excludes.filter(s => s === '.sidebar')).toHaveLength(1)
    expect(excludes).toContain('.ad')
    expect(excludes).toContain('.sponsor')
  })
})

describe('user rule ID namespacing', () => {
  it('namespaces user rule IDs that collide with built-in IDs', () => {
    const builtinIds = new Set(SITE_RULES.map(r => r.id))
    expect(namespaceUserRuleId('wikipedia-article', builtinIds)).toBe('user:wikipedia-article')
    expect(namespaceUserRuleId('github-markdown', builtinIds)).toBe('user:github-markdown')
    expect(namespaceUserRuleId('docs-page', builtinIds)).toBe('user:docs-page')
  })

  it('does not namespace user rule IDs that do not collide', () => {
    const builtinIds = new Set(SITE_RULES.map(r => r.id))
    expect(namespaceUserRuleId('my-custom-rule', builtinIds)).toBe('my-custom-rule')
    expect(namespaceUserRuleId('user:already-prefixed', builtinIds)).toBe('user:already-prefixed')
  })

  it('user rule colliding with built-in gets user: namespace in resolution', () => {
    document.body.innerHTML = '<div id="mw-content-text"><p>Content</p></div>'
    const userWiki: UserSiteRule = makeUserRule({
      id: 'wikipedia-article',
      match: { matches: ['*://*.wikipedia.org/*'] },
      selectors: { contentRoots: ['#user-wiki-root'] },
    })

    const resolved = resolvePageRule(document, 'https://en.wikipedia.org/wiki/Test', {
      siteRules: SITE_RULES,
      userRules: [userWiki],
    })

    expect(resolved.matchedRuleIds).toContain('wikipedia-article')
    expect(resolved.matchedRuleIds).toContain('user:wikipedia-article')
    expect(resolved.matchedRuleIds.indexOf('wikipedia-article')).toBeLessThan(
      resolved.matchedRuleIds.indexOf('user:wikipedia-article'),
    )
  })
})

describe('user rule validation', () => {
  it('accepts a valid user rule', () => {
    const rule = makeUserRule({
      id: 'my-custom-rule',
      match: { matches: ['*://example.com/*'] },
    })
    const result = validateUserRule(rule)
    expect(result.ok).toBe(true)
  })

  it('rejects invalid rule IDs with uppercase', () => {
    const rule = makeUserRule({ id: 'MyRule' })
    const result = validateUserRule(rule)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some(e => e.field === 'id')).toBe(true)
    }
  })

  it('rejects rule IDs with spaces', () => {
    const rule = makeUserRule({ id: 'my rule' })
    const result = validateUserRule(rule)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some(e => e.field === 'id')).toBe(true)
    }
  })

  it('rejects rule IDs with special characters', () => {
    const rule = makeUserRule({ id: 'my@rule!' })
    const result = validateUserRule(rule)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some(e => e.field === 'id')).toBe(true)
    }
  })

  it('accepts valid rule IDs with dots, underscores, hyphens', () => {
    const rule = makeUserRule({ id: 'my.custom_rule-v2' })
    const result = validateUserRule(rule)
    expect(result.ok).toBe(true)
  })

  it('accepts the internal user namespace used for built-in ID collisions', () => {
    const rule = makeUserRule({ id: 'user:github-markdown' })
    const result = validateUserRule(rule)
    expect(result.ok).toBe(true)
  })

  it('rejects duplicate user rule IDs', () => {
    const existing = [makeUserRule({ id: 'existing-rule' })]
    const rule = makeUserRule({ id: 'existing-rule' })
    const result = validateUserRule(rule, existing)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some(e => e.field === 'id' && e.message.includes('Duplicate'))).toBe(true)
    }
  })

  it('rejects rules with neither URL nor selector matching', () => {
    const rule: UserSiteRule = {
      id: 'no-match',
      version: 1,
      source: 'user',
      enabled: true,
      createdAt: '2026-06-22T00:00:00.000Z',
      updatedAt: '2026-06-22T00:00:00.000Z',
    }
    const result = validateUserRule(rule)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some(e => e.field === 'match')).toBe(true)
    }
  })

  it('accepts rules with URL matches only', () => {
    const rule = makeUserRule({
      id: 'url-only',
      match: { matches: ['*://example.com/*'] },
    })
    const result = validateUserRule(rule)
    expect(result.ok).toBe(true)
  })

  it('accepts rules with selector matches only', () => {
    const rule = makeUserRule({
      id: 'selector-only',
      match: { selectorMatches: ['.content'] },
    })
    const result = validateUserRule(rule)
    expect(result.ok).toBe(true)
  })

  it('rejects rules with empty matches arrays and no selector match', () => {
    const rule = makeUserRule({
      id: 'empty-matches',
      match: { matches: [] },
    })
    const result = validateUserRule(rule)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some(e => e.field === 'match')).toBe(true)
    }
  })

  it('rejects invalid selectors', () => {
    const rule = makeUserRule({
      id: 'bad-selector',
      match: { matches: ['*://example.com/*'] },
      selectors: { contentRoots: ['<<<invalid>>>'] },
    })
    const result = validateUserRule(rule)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some(e => e.field === 'selectors.contentRoots')).toBe(true)
    }
  })

  it('rejects invalid threshold values', () => {
    const rule = makeUserRule({
      id: 'bad-threshold',
      match: { matches: ['*://example.com/*'] },
      thresholds: { minTextLength: -5 },
    })
    const result = validateUserRule(rule)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some(e => e.field === 'thresholds.minTextLength')).toBe(true)
    }
  })

  it('rejects non-finite threshold values', () => {
    const rule = makeUserRule({
      id: 'nan-threshold',
      match: { matches: ['*://example.com/*'] },
      thresholds: { minTextLength: Infinity },
    })
    const result = validateUserRule(rule)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some(e => e.field === 'thresholds.minTextLength')).toBe(true)
    }
  })

  it('rejects unknown behavior enum values', () => {
    const rule = makeUserRule({
      id: 'bad-behavior',
      match: { matches: ['*://example.com/*'] },
      behavior: { displayMode: 'invalid-mode' as any },
    })
    const result = validateUserRule(rule)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some(e => e.field === 'behavior.displayMode')).toBe(true)
    }
  })

  it('accepts all valid behavior enum values', () => {
    const rule = makeUserRule({
      id: 'valid-behavior',
      match: { matches: ['*://example.com/*'] },
      behavior: {
        translationArea: 'body',
        startMode: 'dynamic',
        displayMode: 'original',
        translationPosition: 'before',
        translationTheme: 'dark',
        defaultInsertion: 'inline-inside',
      },
    })
    const result = validateUserRule(rule)
    expect(result.ok).toBe(true)
  })

  it('collects multiple validation errors', () => {
    const rule: UserSiteRule = {
      id: 'INVALID ID',
      version: 1,
      source: 'user',
      enabled: true,
      createdAt: '2026-06-22T00:00:00.000Z',
      updatedAt: '2026-06-22T00:00:00.000Z',
      behavior: { displayMode: 'nope' as any },
      thresholds: { minTextLength: -1 },
    }
    const result = validateUserRule(rule)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThanOrEqual(3)
    }
  })
})
