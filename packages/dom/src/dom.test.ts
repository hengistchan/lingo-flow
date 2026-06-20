import { collectTextBlocks, detectBlockType, isTranslatableElement, isVisible } from './index'

describe('DOM collector', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('collects readable paragraphs and skips code/pre blocks', async () => {
    document.body.innerHTML = `
      <main>
        <p>This is a meaningful English paragraph that should be translated by the extension.</p>
        <pre><code>This code block should never be translated by LingoFlow.</code></pre>
        <p>tiny</p>
      </main>
    `

    const blocks = await collectTextBlocks(document, {
      sourceLang: 'en',
      targetLang: 'zh-Hans',
      pageUrl: 'https://developer.mozilla.org/en-US/docs/Web/API',
      domain: 'developer.mozilla.org',
    })

    expect(blocks).toHaveLength(1)
    expect(blocks[0].text).toContain('meaningful English paragraph')
    expect(blocks[0].domain).toBe('developer.mozilla.org')
    expect(document.querySelector('pre')?.getAttribute('data-lingoflow-block-id')).toBeNull()
  })

  it('collects unique elements when selectors overlap', async () => {
    document.body.innerHTML = `
      <main>
        <article>
          <p>This paragraph inside article and main should appear only once in results.</p>
        </article>
        <section>
          <p>This section paragraph is long enough to be collected as a translatable block.</p>
        </section>
      </main>
    `

    const blocks = await collectTextBlocks(document, {
      sourceLang: 'en',
      targetLang: 'zh-Hans',
      pageUrl: 'https://example.com/page',
      domain: 'example.com',
    })

    const ids = blocks.map(block => block.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('rejects invisible, form, nav, and already translated elements', () => {
    document.body.innerHTML = `
      <p id="visible">This visible paragraph is long enough to pass the translatable text threshold.</p>
      <nav><p id="nav">This navigation paragraph is long enough but should not pass.</p></nav>
      <textarea id="textarea">This textarea content should not be translated at all.</textarea>
      <p id="done" data-lingoflow-block-id="block_done">Already mapped text should be skipped.</p>
    `

    expect(isTranslatableElement(document.querySelector('#visible') as HTMLElement)).toBe(true)
    expect(isTranslatableElement(document.querySelector('#nav') as HTMLElement)).toBe(false)
    expect(isTranslatableElement(document.querySelector('#textarea') as HTMLElement)).toBe(false)
    expect(isTranslatableElement(document.querySelector('#done') as HTMLElement)).toBe(false)
  })
})

describe('detectBlockType', () => {
  it('Classifies h1-h6 as heading', () => {
    for (let i = 1; i <= 6; i++) {
      const el = document.createElement(`h${i}`)
      expect(detectBlockType(el)).toBe('heading')
    }
  })

  it('Classifies p as paragraph', () => {
    const el = document.createElement('p')
    expect(detectBlockType(el)).toBe('paragraph')
  })

  it('Classifies li as list', () => {
    const el = document.createElement('li')
    expect(detectBlockType(el)).toBe('list')
  })

  it('Classifies blockquote as quote', () => {
    const el = document.createElement('blockquote')
    expect(detectBlockType(el)).toBe('quote')
  })

  it('Classifies td/th as table', () => {
    const td = document.createElement('td')
    expect(detectBlockType(td)).toBe('table')

    const th = document.createElement('th')
    expect(detectBlockType(th)).toBe('table')
  })

  it('Classifies div as unknown', () => {
    const el = document.createElement('div')
    expect(detectBlockType(el)).toBe('unknown')
  })
})

describe('isVisible', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('Returns false for hidden elements', () => {
    const el = document.createElement('div')
    el.hidden = true
    document.body.appendChild(el)
    expect(isVisible(el)).toBe(false)
  })

  it('Returns false for aria-hidden=true', () => {
    const el = document.createElement('div')
    el.setAttribute('aria-hidden', 'true')
    document.body.appendChild(el)
    expect(isVisible(el)).toBe(false)
  })

  it('Returns false for display:none', () => {
    const el = document.createElement('div')
    el.style.display = 'none'
    document.body.appendChild(el)
    expect(isVisible(el)).toBe(false)
  })

  it('Returns false for visibility:hidden', () => {
    const el = document.createElement('div')
    el.style.visibility = 'hidden'
    document.body.appendChild(el)
    expect(isVisible(el)).toBe(false)
  })

  it('Returns true for visible elements', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    expect(isVisible(el)).toBe(true)
  })
})

describe('isTranslatableElement', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('Rejects elements shorter than 20 characters', () => {
    const el = document.createElement('p')
    el.textContent = 'Short text.'
    document.body.appendChild(el)
    expect(isTranslatableElement(el)).toBe(false)
  })

  it('Rejects elements inside code/pre', () => {
    const wrapper = document.createElement('pre')
    const el = document.createElement('span')
    el.textContent = 'This is a long enough text inside a pre block to test.'
    wrapper.appendChild(el)
    document.body.appendChild(wrapper)
    expect(isTranslatableElement(el)).toBe(false)
  })

  it('Rejects elements already translated', () => {
    const el = document.createElement('p')
    el.textContent = 'This paragraph has already been translated by the tool.'
    el.dataset.lingoflowBlockId = 'block_1_abc123'
    document.body.appendChild(el)
    expect(isTranslatableElement(el)).toBe(false)
  })

  it('Accepts visible paragraphs with enough text', () => {
    const el = document.createElement('p')
    el.textContent = 'This is a sufficiently long paragraph that should be accepted by the filter.'
    document.body.appendChild(el)
    expect(isTranslatableElement(el)).toBe(true)
  })
})

describe('collectTextBlocks', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  const defaultOptions = {
    sourceLang: 'en' as const,
    targetLang: 'zh-Hans',
    pageUrl: 'https://example.com/page',
    domain: 'example.com',
  }

  it('Collects headings with correct blockType', async () => {
    document.body.innerHTML = `
      <main>
        <h1>This is a main heading that is long enough to be collected.</h1>
        <p>This is a paragraph element that is also long enough to be collected.</p>
      </main>
    `

    const blocks = await collectTextBlocks(document, defaultOptions)

    expect(blocks).toHaveLength(2)
    const heading = blocks.find(b => b.text.includes('main heading'))
    const paragraph = blocks.find(b => b.text.includes('paragraph element'))

    expect(heading).toBeDefined()
    expect(heading!.meta.blockType).toBe('heading')
    expect(paragraph).toBeDefined()
    expect(paragraph!.meta.blockType).toBe('paragraph')
  })

  it('Skips elements inside nav/footer/header', async () => {
    document.body.innerHTML = `
      <nav>
        <p>This navigation text is long enough to be collected but is inside a nav element.</p>
      </nav>
      <footer>
        <p>This footer text is also long enough to be collected but is inside a footer element.</p>
      </footer>
      <header>
        <p>This header text is also long enough to be collected but is inside a header element.</p>
      </header>
      <main>
        <p>This main content paragraph is long enough to be collected and is outside of nav.</p>
      </main>
    `

    const blocks = await collectTextBlocks(document, defaultOptions)

    expect(blocks).toHaveLength(1)
    expect(blocks[0].text).toContain('main content paragraph')
  })

  it('Assigns unique block IDs with data-lingoflow-block-id', async () => {
    document.body.innerHTML = `
      <main>
        <h2>The first heading block is long enough to be assigned a unique block identifier.</h2>
        <p>The second paragraph block is also long enough to be assigned its own unique identifier.</p>
        <li>A list item that is sufficiently long to also get its own unique block identifier value.</li>
      </main>
    `

    const blocks = await collectTextBlocks(document, defaultOptions)

    expect(blocks.length).toBeGreaterThan(1)

    const ids = blocks.map(b => b.id)
    expect(new Set(ids).size).toBe(ids.length)

    for (const block of blocks) {
      const el = document.querySelector(`[data-lingoflow-block-id="${block.id}"]`)
      expect(el).not.toBeNull()
    }
  })

  it('Collects GitHub Markdown headings and avoids duplicate blockquote paragraph translations', async () => {
    document.body.innerHTML = `
      <main>
        <div class="comment-body markdown-body js-comment-body">
          <h2 dir="auto">What</h2>
          <p dir="auto">The top-level <code class="notranslate">README.md</code> carried a terser banner:</p>
          <blockquote>
            <p dir="auto"><strong>Public beta</strong> - the <code class="notranslate">@vue-tui/runtime</code> API is stabilizing, and we're now seeking public feedback to lock it down before 1.0.</p>
          </blockquote>
          <h2 dir="auto">Why</h2>
          <p dir="auto">The homepage is the first thing people see, but it was missing the public-feedback framing.</p>
          <h2 dir="auto">Notes</h2>
          <p dir="auto">Docs-only, single-line change. No code or behavior affected.</p>
          <pre><code>const shouldNotTranslate = true</code></pre>
        </div>
      </main>
    `

    const blocks = await collectTextBlocks(document, {
      ...defaultOptions,
      pageUrl: 'https://github.com/vuejs-ai/vue-tui/pull/1',
      domain: 'github.com',
    })

    expect(blocks.map(block => block.text)).toEqual(expect.arrayContaining(['What', 'Why', 'Notes']))

    const publicBetaBlocks = blocks.filter(block => block.text.includes('Public beta'))
    expect(publicBetaBlocks).toHaveLength(1)
    expect(publicBetaBlocks[0].meta.tagName).toBe('p')
    expect(document.querySelector('blockquote')?.getAttribute('data-lingoflow-block-id')).toBeNull()

    const intro = blocks.find(block => block.text.includes('README.md'))
    expect(intro?.text).toContain('README.md')
    expect(blocks.some(block => block.text.includes('shouldNotTranslate'))).toBe(false)
  })

  it('Collects markdown bodies even when they are not nested under main or article', async () => {
    document.body.innerHTML = `
      <div class="markdown-body">
        <h2>What</h2>
        <p>This standalone markdown body should still be collected as readable content.</p>
      </div>
    `

    const blocks = await collectTextBlocks(document, {
      ...defaultOptions,
      pageUrl: 'https://github.com/example/repo/pull/2',
      domain: 'github.com',
    })

    expect(blocks.map(block => block.text)).toEqual(expect.arrayContaining([
      'What',
      'This standalone markdown body should still be collected as readable content.',
    ]))
  })

  it('Falls back to scored generic content containers when semantic roots are absent', async () => {
    document.body.innerHTML = `
      <div class="layout-shell">
        <div class="promo">Tiny promo copy.</div>
        <div class="story-panel">
          <p>The first generic article paragraph is long enough to establish this panel as the main reading container.</p>
          <p>The second generic article paragraph gives the scorer enough text density to prefer this content.</p>
        </div>
      </div>
    `

    const blocks = await collectTextBlocks(document, {
      ...defaultOptions,
      pageUrl: 'https://example.com/blog/post',
      domain: 'example.com',
    })

    expect(blocks.map(block => block.text)).toEqual([
      'The first generic article paragraph is long enough to establish this panel as the main reading container.',
      'The second generic article paragraph gives the scorer enough text density to prefer this content.',
    ])
  })

  it('Keeps table cells as structural translation boundaries when cells contain paragraphs', async () => {
    document.body.innerHTML = `
      <main>
        <table>
          <tbody>
            <tr>
              <td><p>This table cell paragraph is long enough to translate but must stay inside the cell.</p></td>
            </tr>
          </tbody>
        </table>
      </main>
    `

    const blocks = await collectTextBlocks(document, defaultOptions)

    expect(blocks).toHaveLength(1)
    expect(blocks[0].meta.tagName).toBe('td')
    expect(blocks[0].text).toBe('This table cell paragraph is long enough to translate but must stay inside the cell.')
    expect(document.querySelector('td')?.getAttribute('data-lingoflow-block-id')).toBe(blocks[0].id)
    expect(document.querySelector('td p')?.getAttribute('data-lingoflow-block-id')).toBeNull()
  })

  it('Separates nested list item text instead of duplicating child list content in the parent item', async () => {
    document.body.innerHTML = `
      <main>
        <ul>
          <li>
            Install the package manager before running the development server for this project.
            <ul>
              <li>Use the workspace command from the repository root when running extension tests.</li>
            </ul>
          </li>
        </ul>
      </main>
    `

    const blocks = await collectTextBlocks(document, defaultOptions)

    expect(blocks.map(block => block.text)).toEqual([
      'Install the package manager before running the development server for this project.',
      'Use the workspace command from the repository root when running extension tests.',
    ])
  })

  it('Protects inline code, links, package names, URLs, and commit hashes in provider request text', async () => {
    document.body.innerHTML = `
      <main>
        <p>
          Update <code>README.md</code> after <a href="https://github.com/example/repo/commit/a285a523f979213a205fa7008b07927482c76763">a285a52</a>
          so <code>@vue-tui/runtime</code> points readers to https://example.com/docs before the beta release.
        </p>
      </main>
    `

    const blocks = await collectTextBlocks(document, defaultOptions)
    const block = blocks[0]

    expect(block.text).toContain('README.md')
    expect(block.text).toContain('a285a52')
    expect(block.text).toContain('@vue-tui/runtime')
    expect(block.text).toContain('https://example.com/docs')
    expect(block.requestText).toContain('[[LF0]]')
    expect(block.requestText).toContain('[[LF1]]')
    expect(block.requestText).not.toContain('README.md')
    expect(block.requestText).not.toContain('@vue-tui/runtime')
    expect(block.inlineTokens.map(token => token.text)).toEqual(expect.arrayContaining([
      'README.md',
      'a285a52',
      '@vue-tui/runtime',
      'https://example.com/docs',
    ]))
  })
})
