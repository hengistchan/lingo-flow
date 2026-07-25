import { generateSelectorCandidates } from './selector-candidates'

describe('selector candidate generation', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('prefers stable unique identifiers and semantic selectors', () => {
    document.body.innerHTML = `
      <main id="reader" class="docs-content active">
        <article data-testid="article-body" class="markdown-body css-a1b2c3d4e5f6">
          <p>Readable content.</p>
        </article>
      </main>
    `
    const article = document.querySelector('article')!
    const candidates = generateSelectorCandidates(article)

    expect(candidates[0]).toMatchObject({
      selector: '[data-testid="article-body"]',
      strategy: 'test-id',
      matchCount: 1,
    })
    expect(candidates.some(candidate => candidate.selector === 'article.markdown-body')).toBe(true)
    expect(candidates.every(candidate => !candidate.selector.includes('css-a1b2c3d4e5f6'))).toBe(true)
  })

  it('penalizes broad selectors and provides a structural fallback warning', () => {
    document.body.innerHTML = `
      <div class="content"><p>First</p></div>
      <div class="content"><p id="target">Second</p></div>
    `
    const target = document.querySelectorAll('.content')[1]
    const candidates = generateSelectorCandidates(target)
    const structural = candidates.find(candidate => candidate.strategy === 'structural-path')

    expect(structural).toBeDefined()
    expect(structural!.warnings.join(' ')).toContain('page structure')
    expect(candidates.some(candidate => candidate.matchCount > 1)).toBe(true)
  })
})
