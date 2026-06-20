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
})
