import type { PageRule } from '@lingoflow/types'

export const wikipediaRule: PageRule = {
  id: 'wikipedia',
  description: 'Wikipedia article pages',
  priority: 10,
  match: {
    matches: ['*://*.wikipedia.org/*'],
    excludeMatches: ['*://*.wikipedia.org/wiki/Special:*', '*://*.wikipedia.org/wiki/Talk:*'],
    selectorMatches: ['#mw-content-text'],
  },
  selectors: {
    contentRoots: ['#mw-content-text', '.mw-parser-output'],
  },
}

export const githubRule: PageRule = {
  id: 'github',
  description: 'GitHub Markdown content',
  priority: 10,
  match: {
    matches: ['*://github.com/*'],
    selectorMatches: ['.markdown-body'],
  },
  selectors: {
    contentRoots: ['.markdown-body', '.md-content'],
  },
}

export const SITE_RULES: PageRule[] = [wikipediaRule, githubRule]
