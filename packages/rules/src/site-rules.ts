import type { SiteRule } from '@lingoflow/types'

export const wikipediaRule: SiteRule = {
  id: 'wikipedia-article',
  version: 1,
  source: 'built-in',
  description: 'Wikipedia article pages',
  priority: 20,
  match: {
    matches: ['*://*.wikipedia.org/wiki/*'],
    excludeMatches: ['*://*.wikipedia.org/wiki/Special:*', '*://*.wikipedia.org/wiki/Talk:*'],
    selectorMatches: ['#mw-content-text'],
  },
  selectors: {
    contentRoots: ['#mw-content-text', '.mw-parser-output'],
    excludeSelectors: ['.navbox', '.infobox', '.reference', '.mw-editsection'],
  },
}

export const githubRule: SiteRule = {
  id: 'github-markdown',
  version: 1,
  source: 'built-in',
  description: 'GitHub Markdown content',
  priority: 20,
  match: {
    matches: ['*://github.com/*'],
    selectorMatches: ['.markdown-body'],
  },
  selectors: {
    contentRoots: ['.markdown-body'],
    excludeSelectors: [
      '.file-navigation',
      '.js-comment-form',
      '.timeline-comment-actions',
      'pre',
      'code',
    ],
  },
}

export const docsPageRule: SiteRule = {
  id: 'docs-page',
  version: 1,
  source: 'built-in',
  description: 'Documentation pages',
  priority: 10,
  match: {
    matches: ['*://docs.*/*', '*/docs/*', '*/documentation/*', '*/guide/*', '*/reference/*'],
    selectorMatches: ['main', 'article', '[role="main"]', '.prose', '.md-content'],
  },
  selectors: {
    contentRoots: ['main', 'article', '[role="main"]', '.prose', '.md-content'],
    excludeSelectors: ['.sidebar', '.toc', '.breadcrumb', '.nav-footer', 'nav'],
  },
}

export const SITE_RULES: SiteRule[] = [docsPageRule, wikipediaRule, githubRule]
