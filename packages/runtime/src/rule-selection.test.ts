import { RuleSelectionController } from './rule-selection'

describe('interactive rule selection', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <nav class="site-nav">Navigation</nav>
      <main id="reader">
        <article data-testid="article-body">
          <p>Readable article content for selector generation.</p>
        </article>
      </main>
    `
  })

  it('highlights and serializes a selected content root without retaining DOM references', async () => {
    const article = document.querySelector('article')!
    Object.defineProperty(article, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 10, top: 20, width: 300, height: 180 }),
    })
    const controller = new RuleSelectionController(document)
    const resultPromise = controller.select('content-root')

    article.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, composed: true }))
    const highlight = document.querySelector('[data-lingoflow-rule-selection-overlay="highlight"]') as HTMLElement
    expect(highlight.style.left).toBe('10px')
    expect(highlight.style.width).toBe('300px')

    article.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, cancelable: true }))
    const result = await resultPromise

    expect(result).toMatchObject({
      kind: 'content-root',
      domain: 'localhost',
      element: {
        tagName: 'article',
      },
    })
    expect(result.candidates[0].selector).toBe('[data-testid="article-body"]')
    expect(JSON.stringify(result)).not.toContain('ownerDocument')
    expect(document.querySelector('[data-lingoflow-rule-selection-overlay]')).toBeNull()
  })

  it('cancels selection with Escape and removes all generated UI', async () => {
    const controller = new RuleSelectionController(document)
    const result = controller.select('exclude')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

    await expect(result).rejects.toThrow('cancelled')
    expect(document.querySelector('[data-lingoflow-rule-selection-overlay]')).toBeNull()
  })

  it('maps a generated translation back to its source instead of generating a LingoFlow selector', async () => {
    const paragraph = document.querySelector('article p') as HTMLElement
    paragraph.dataset.lingoflowBlockId = 'block_source'
    paragraph.id = 'source-paragraph'
    Object.defineProperty(paragraph, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 24, top: 40, width: 260, height: 72 }),
    })

    const translation = document.createElement('span')
    translation.className = 'lingoflow-translation lingoflow-translation-inline'
    translation.dataset.lingoflowGenerated = 'true'
    translation.dataset.lingoflowBlockId = 'block_source'
    translation.dataset.lingoflowTranslation = 'block_source'
    translation.textContent = '这是 LingoFlow 生成的译文。'
    paragraph.appendChild(translation)

    const controller = new RuleSelectionController(document)
    const resultPromise = controller.select('placement')
    translation.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, composed: true }))

    const highlight = document.querySelector('[data-lingoflow-rule-selection-overlay="highlight"]') as HTMLElement
    expect(highlight.style.left).toBe('24px')
    expect(highlight.style.width).toBe('260px')

    translation.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, cancelable: true }))
    const result = await resultPromise

    expect(result.element.tagName).toBe('p')
    expect(result.element.textPreview).not.toContain('这是 LingoFlow 生成的译文')
    expect(result.candidates[0].selector).toBe('#source-paragraph')
    expect(result.candidates.every(candidate => !candidate.selector.includes('lingoflow'))).toBe(true)
  })
})
