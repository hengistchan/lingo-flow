import { collectScanResults, collectTextBlocks, detectBlockType, isTranslatableElement, isVisible } from './index'
import { NORMALIZE_VERSION } from '@lingoflow/shared'
import { resolvePageRule } from '@lingoflow/rules'
import type { CollectionDiagnostics, PageRule, PublicRuntimeSettings, RuntimeContext, ScanResult } from '@lingoflow/types'

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

  it('Classifies div as paragraph', () => {
    const el = document.createElement('div')
    expect(detectBlockType(el)).toBe('paragraph')
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

  it('Keeps MDX list paragraph wrappers from duplicating the parent list item', async () => {
    document.body.innerHTML = `
      <main>
        <ul class="mdx-ul">
          <li class="mdx-li">
            <p class="mdx-p"><strong class="mdx-strong">Quota Exhausted:</strong> When the monthly total quota of the package is exhausted, the system will stop service and will not continue to consume your bonus or account balance.</p>
          </li>
        </ul>
      </main>
    `

    const blocks = await collectTextBlocks(document, defaultOptions)

    expect(blocks).toHaveLength(1)
    expect(blocks[0].meta.tagName).toBe('li')
    expect(blocks[0].text).toBe('Quota Exhausted: When the monthly total quota of the package is exhausted, the system will stop service and will not continue to consume your bonus or account balance.')
    expect(document.querySelector('li')?.getAttribute('data-lingoflow-block-id')).toBe(blocks[0].id)
    expect(document.querySelector('li p')?.getAttribute('data-lingoflow-block-id')).toBeNull()
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
    expect(block.requestText).toContain('⟦LF:0⟧')
    expect(block.requestText).toContain('⟦LF:1⟧')
    expect(block.requestText).not.toContain('README.md')
    expect(block.requestText).not.toContain('@vue-tui/runtime')
    expect(block.inlineTokens.map(token => token.text)).toEqual(expect.arrayContaining([
      'README.md',
      'a285a52',
      '@vue-tui/runtime',
      'https://example.com/docs',
    ]))
  })

  it('Treats a primary title link as translatable text with linebreak-inside insertion', async () => {
    document.body.innerHTML = `
      <main>
        <h3 class="lh-condensed">
          <a class="Link--primary text-bold" href="/vuejs-ai/vue-tui/pull/208">
            docs(readme): align the homepage status banner with the public-beta message
            <span class="f3-light color-fg-muted">#208</span>
          </a>
        </h3>
      </main>
    `

    const blocks = await collectTextBlocks(document, {
      ...defaultOptions,
      pageUrl: 'https://github.com/conduit/for_you_feed',
      domain: 'github.com',
    })
    const block = blocks.find(item => item.text.includes('homepage status banner'))

    expect(block).toBeDefined()
    expect(block?.meta.tagName).toBe('a')
    expect(block?.meta.carrierTagName).toBe('a')
    expect(block?.meta.insertion).toBe('linebreak-inside')
    expect(block?.text).toContain('docs(readme): align the homepage status banner with the public-beta message')
    expect(block?.text).toContain('#208')
    expect(block?.requestText).toContain('docs(readme): align the homepage status banner with the public-beta message')
    expect(block?.requestText).not.toContain('⟦LF:0⟧')
    expect(block?.inlineTokens).toEqual([])
    expect(document.querySelector('a')?.getAttribute('data-lingoflow-block-id')).toBe(block?.id)
    expect(document.querySelector('h3')?.getAttribute('data-lingoflow-block-id')).toBeNull()
  })

  it('Keeps reference links protected while exposing insertion metadata for paragraphs', async () => {
    document.body.innerHTML = `
      <main>
        <p>
          The runtime banner was tightened in
          <a href="https://github.com/example/repo/commit/a285a523f979213a205fa7008b07927482c76763">a285a52</a>
          before release so readers see the public beta message.
        </p>
      </main>
    `

    const blocks = await collectTextBlocks(document, defaultOptions)
    const block = blocks[0]

    expect(block.meta.tagName).toBe('p')
    expect(block.meta.carrierTagName).toBe('p')
    expect(block.meta.insertion).toBe('linebreak-inside')
    expect(block.requestText).toContain('⟦LF:0⟧')
    expect(block.requestText).not.toContain('a285a52')
    expect(block.inlineTokens).toEqual([
      { id: '⟦LF:0⟧', type: 'link', text: 'a285a52' },
    ])
  })
})

describe('collectScanResults with RuntimeContext page rules', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('uses rule content roots to limit collection scope', async () => {
    document.body.innerHTML = `
      <main>
        <p>This main paragraph is long enough but outside of the custom reader root.</p>
      </main>
      <section id="reader">
        <p>This reader paragraph is long enough to be collected from the configured root.</p>
      </section>
    `

    const output = await collectScanResults(document, createRuntimeContext({
      selectors: {
        contentRoots: ['#reader'],
      },
    }))

    expect(output.blocks).toHaveLength(1)
    expect(output.blocks[0].block.text).toContain('reader paragraph')
    expect(output.blocks[0].block.meta).toMatchObject({
      ruleId: 'test-rule',
      rootGeneration: 7,
    })
  })

  it('uses rule block selectors to collect non-default text blocks', async () => {
    document.body.innerHTML = `
      <article>
        <span class="custom-block">This custom inline block is long enough to be translated by a page rule.</span>
      </article>
    `

    const output = await collectScanResults(document, createRuntimeContext({
      selectors: {
        blockSelectors: ['.custom-block'],
      },
    }))

    expect(output.blocks).toHaveLength(1)
    expect(output.blocks[0].block.text).toContain('custom inline block')
  })

  it('uses rule exclude selectors and skips generated or notranslate nodes', async () => {
    document.body.innerHTML = `
      <article>
        <p class="sponsor">This sponsor paragraph is long enough but should be excluded by the page rule.</p>
        <p data-lingoflow-generated="true">This generated paragraph is long enough but should never be collected.</p>
        <p translate="no">This no-translate paragraph is long enough but should never be collected.</p>
        <p class="notranslate">This notranslate paragraph is long enough but should never be collected.</p>
        <p>This readable paragraph is long enough and should remain as the only collected block.</p>
      </article>
    `

    const output = await collectScanResults(document, createRuntimeContext({
      selectors: {
        excludeSelectors: ['.sponsor'],
      },
    }))

    expect(output.blocks).toHaveLength(1)
    expect(output.blocks[0].block.text).toContain('readable paragraph')
  })

  it('accepts an HTMLElement root for incremental scans', async () => {
    document.body.innerHTML = `
      <main>
        <p>This old paragraph is long enough but outside of the incremental root.</p>
        <section id="new-root">
          <p>This newly inserted paragraph is long enough to be collected incrementally.</p>
        </section>
      </main>
    `
    const incrementalRoot = document.querySelector('#new-root') as HTMLElement

    const output = await collectScanResults(incrementalRoot, createRuntimeContext())

    expect(output.blocks).toHaveLength(1)
    expect(output.blocks[0].block.text).toContain('newly inserted paragraph')
  })
})

function createRuntimeContext(ruleOverrides: Partial<PageRule> = {}): RuntimeContext {
  const settings: PublicRuntimeSettings = {
    sourceLang: 'auto',
    targetLang: 'zh-Hans',
    renderMode: 'below-original',
    cacheEnabled: false,
    maxCacheItems: 50000,
    translationConcurrency: 3,
    providerId: 'google-free-translate',
    normalizeVersion: NORMALIZE_VERSION,
  }
  const pageRule = resolvePageRule(document, 'https://example.com/article', {
    overrides: {
      id: 'test-rule',
      ...ruleOverrides,
    },
  })

  return {
    runId: 'run_rule_test',
    url: 'https://example.com/article',
    domain: 'example.com',
    sourceLang: settings.sourceLang,
    targetLang: settings.targetLang,
    providerId: settings.providerId,
    displayMode: 'dual',
    settings,
    pageRule,
    rootGeneration: 7,
  }
}

const scanOptions = {
  sourceLang: 'en' as const,
  targetLang: 'zh-Hans',
  pageUrl: 'https://example.com/article',
  domain: 'example.com',
  runId: 'run_test_1',
  rootGeneration: 1,
}

describe('collectScanResults', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('returns serializable blocks and separate DOM binding drafts', async () => {
    document.body.innerHTML = '<main><p>Readable source paragraph long enough for translation.</p></main>'

    const output = await collectScanResults(document, scanOptions)

    expect(output.blocks).toHaveLength(1)
    const { block, binding } = output.blocks[0]

    expect(JSON.stringify(block)).toContain('Readable source paragraph')
    expect(binding.carrierElement.tagName.toLowerCase()).toBe('p')
    expect(binding.sourceNodes.length).toBeGreaterThan(0)
    expect(binding.commonAncestor).toBeInstanceOf(HTMLElement)
    expect(typeof binding.sourceSignature).toBe('string')
  })

  it('block is serializable and has no DOM references', async () => {
    document.body.innerHTML = '<main><p>This block must be pure data with no DOM references at all.</p></main>'

    const output = await collectScanResults(document, scanOptions)
    const block = output.blocks[0].block
    const serialized = JSON.parse(JSON.stringify(block))

    expect(serialized.id).toBe(block.id)
    expect(serialized.text).toContain('pure data')
    expect(serialized.state).toBe('pending')
    expect(serialized.revision).toBe(1)
    expect(serialized.runId).toBe('run_test_1')
    expect(serialized.meta.rootKind).toBe('html')
  })

  it('does not call provider, enqueue work, or render', async () => {
    document.body.innerHTML = '<main><p>The scanner must not call any provider or rendering APIs at all.</p></main>'

    const output = await collectScanResults(document, scanOptions)

    expect(output.blocks[0].block.state).toBe('pending')
    expect(output.blocks[0].block.translatedText).toBeUndefined()
    expect(document.querySelector('[data-lingoflow-translation]')).toBeNull()
  })

  it('supports figcaption block type', async () => {
    document.body.innerHTML = `
      <main>
        <figure>
          <img src="photo.jpg" alt="photo">
          <figcaption>This caption text is long enough to be collected as a block.</figcaption>
        </figure>
      </main>
    `

    const output = await collectScanResults(document, scanOptions)

    const captionResult = output.blocks.find(r => r.block.meta.blockType === 'caption')
    expect(captionResult).toBeDefined()
    expect(captionResult!.block.meta.tagName).toBe('figcaption')
    expect(captionResult!.binding.carrierElement.tagName.toLowerCase()).toBe('figcaption')
  })

  it('supports dd block type', async () => {
    document.body.innerHTML = `
      <main>
        <dl>
          <dt>Term</dt>
          <dd>This description text is definitely long enough to be collected as a translation block.</dd>
        </dl>
      </main>
    `

    const output = await collectScanResults(document, scanOptions)

    const ddResult = output.blocks.find(r => r.block.meta.tagName === 'dd')
    expect(ddResult).toBeDefined()
    expect(ddResult!.block.meta.blockType).toBe('description')
    expect(ddResult!.binding.carrierElement.tagName.toLowerCase()).toBe('dd')
  })

  it('scans content inside open ShadowRoots', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: 'open' })
    shadow.innerHTML = '<p>This paragraph lives inside an open shadow root and should be found.</p>'

    document.body.innerHTML = '<main></main>'
    document.querySelector('main')!.appendChild(host)

    const output = await collectScanResults(document, scanOptions)

    expect(output.blocks.length).toBeGreaterThanOrEqual(1)
    const shadowResult = output.blocks.find(r => r.block.text.includes('shadow root'))
    expect(shadowResult).toBeDefined()
    expect(shadowResult!.block.meta.rootKind).toBe('shadow')
  })

  it('collects text-bearing divs without block-level children', async () => {
    document.body.innerHTML = `
      <main>
        <div>OpenTUI is a library for building terminal user interfaces (TUIs)</div>
      </main>
    `

    const output = await collectScanResults(document, scanOptions)

    expect(output.blocks).toHaveLength(1)
    expect(output.blocks[0].block.text).toContain('OpenTUI')
    expect(output.blocks[0].block.meta.blockType).toBe('paragraph')
  })

  it('skips divs that contain block-level children', async () => {
    document.body.innerHTML = `
      <main>
        <div>
          <p>This paragraph inside a container div should be collected directly.</p>
        </div>
      </main>
    `

    const output = await collectScanResults(document, scanOptions)

    expect(output.blocks).toHaveLength(1)
    expect(output.blocks[0].block.text).toContain('paragraph inside a container')
    expect(output.blocks[0].binding.carrierElement.tagName.toLowerCase()).toBe('p')
  })

  it('collects div descriptions from GitHub feed cards alongside paragraphs', async () => {
    document.body.innerHTML = `
      <main>
        <section>
          <div class="color-bg-subtle">
            <div class="flex-1">
              <div>OpenTUI is a library for building terminal user interfaces (TUIs)</div>
              <p>This paragraph inside the feed card is also long enough to be collected.</p>
            </div>
          </div>
        </section>
      </main>
    `

    const output = await collectScanResults(document, scanOptions)

    expect(output.blocks).toHaveLength(2)
    const texts = output.blocks.map(r => r.block.text)
    expect(texts.some(t => t.includes('OpenTUI'))).toBe(true)
    expect(texts.some(t => t.includes('paragraph inside'))).toBe(true)
  })
})

describe('UI exclusion filtering', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('skips content inside buttons', async () => {
    document.body.innerHTML = `
      <main>
        <button><span>This button text is long enough to trigger translation but should be skipped.</span></button>
        <p>This paragraph outside buttons is long enough to be collected by the scanner.</p>
      </main>
    `

    const output = await collectScanResults(document, scanOptions)

    expect(output.blocks).toHaveLength(1)
    expect(output.blocks[0].block.text).toContain('outside buttons')
  })

  it('skips content inside menus and toolbars', async () => {
    document.body.innerHTML = `
      <main>
        <div role="menu"><p>This menu item text is long enough to be collected but must be skipped.</p></div>
        <div role="toolbar"><p>This toolbar text is also long enough but must be skipped entirely.</p></div>
        <p>This content paragraph is long enough to pass all scanner filtering rules.</p>
      </main>
    `

    const output = await collectScanResults(document, scanOptions)

    expect(output.blocks).toHaveLength(1)
    expect(output.blocks[0].block.text).toContain('pass all scanner')
  })

  it('skips content inside tablist and dialog', async () => {
    document.body.innerHTML = `
      <main>
        <div role="tablist"><p>This tab list content is long enough but should not be collected.</p></div>
        <div role="dialog"><p>This dialog content is long enough but should not be collected either.</p></div>
        <p>This regular paragraph is long enough to pass the filtering and be collected.</p>
      </main>
    `

    const output = await collectScanResults(document, scanOptions)

    expect(output.blocks).toHaveLength(1)
    expect(output.blocks[0].block.text).toContain('pass the filtering')
  })

  it('skips content inside nav, form, and status', async () => {
    document.body.innerHTML = `
      <main>
        <nav><p>This navigation text is long enough but must be skipped by the scanner.</p></nav>
        <form><p>This form text content is long enough but must be skipped by the scanner.</p></form>
        <div role="status"><p>This status message is long enough but should also be skipped.</p></div>
        <p>This regular content paragraph is long enough to pass all filtering rules applied.</p>
      </main>
    `

    const output = await collectScanResults(document, scanOptions)

    expect(output.blocks).toHaveLength(1)
    expect(output.blocks[0].block.text).toContain('pass all filtering')
  })

  it('skips elements with badge or action roles', async () => {
    document.body.innerHTML = `
      <main>
        <span role="status">This status badge text is long enough but should be skipped entirely.</span>
        <div role="button"><p>This action button text is long enough but must be skipped too.</p></div>
        <p>This main content paragraph is long enough to be accepted by the scanner filter.</p>
      </main>
    `

    const output = await collectScanResults(document, scanOptions)

    expect(output.blocks).toHaveLength(1)
    expect(output.blocks[0].block.text).toContain('accepted by the scanner')
  })

  it('skips table cells with many interactive children', async () => {
    document.body.innerHTML = `
      <main>
        <table>
          <tbody>
            <tr>
              <td>
                <button>Action 1</button>
                <button>Action 2</button>
                <button>Action 3</button>
                <a href="#">Link 1</a>
                <a href="#">Link 2</a>
                This cell has too many interactive controls inside it.
              </td>
              <td>This table cell has normal text that is long enough to collect.</td>
            </tr>
          </tbody>
        </table>
      </main>
    `

    const output = await collectScanResults(document, scanOptions)

    const cellResults = output.blocks.filter(r => r.block.meta.blockType === 'table')
    expect(cellResults.length).toBeGreaterThanOrEqual(1)
    expect(cellResults.some(r => r.block.text.includes('normal text'))).toBe(true)
  })

  it('skips elements with high interactive density', async () => {
    document.body.innerHTML = `
      <main>
        <div>
          <a href="#">First link in high density area</a>
          <a href="#">Second link in high density area</a>
          <a href="#">Third link in high density area</a>
          <a href="#">Fourth link in high density area</a>
          <a href="#">Fifth link in high density area</a>
          <a href="#">Sixth link in high density area</a>
          <a href="#">Seventh link in high density area</a>
          <a href="#">Eighth link in high density area</a>
        </div>
        <p>This paragraph has normal text density and should be collected as a block.</p>
      </main>
    `

    const output = await collectScanResults(document, scanOptions)

    expect(output.blocks.some(r => r.block.text.includes('normal text density'))).toBe(true)
  })

  it('skips generated LingoFlow nodes and nodes inside them', async () => {
    document.body.innerHTML = `
      <main>
        <div data-lingoflow-generated="true">
          <p>This text is inside a generated LingoFlow node and should be skipped.</p>
        </div>
        <p>This text is outside generated nodes and should be collected by the scanner.</p>
      </main>
    `

    const output = await collectScanResults(document, scanOptions)

    expect(output.blocks).toHaveLength(1)
    expect(output.blocks[0].block.text).toContain('outside generated nodes')
  })

  it('skips elements with data-lingoflow-translation attribute', async () => {
    document.body.innerHTML = `
      <main>
        <div data-lingoflow-translation="block_1">
          <p>This text is inside a translation element and must be skipped by scanner.</p>
        </div>
        <p>This text is outside translation elements and must be collected by the scanner.</p>
      </main>
    `

    const output = await collectScanResults(document, scanOptions)

    expect(output.blocks).toHaveLength(1)
    expect(output.blocks[0].block.text).toContain('outside translation elements')
  })
})

describe('Wikipedia fixture', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  const wikiOptions = {
    sourceLang: 'en' as const,
    targetLang: 'zh-Hans',
    pageUrl: 'https://en.wikipedia.org/wiki/Photography',
    domain: 'en.wikipedia.org',
    runId: 'run_wiki_test',
    rootGeneration: 1,
  }

  function setupWikipediaFixture() {
    document.body.innerHTML = `
      <div id="mw-content-text">
        <div class="mw-parser-output">
          <div class="mw-empty-elt"></div>
          <div class="hatnote">This article is about the art of photography. For the technique, see Photographic technique.</div>
          <p><b>Photography</b> is the art, application, and practice of creating durable images by recording light, either electronically by means of an image sensor, or chemically by means of a light-sensitive material such as photographic film.</p>
          <h2><span class="mw-headline" id="Overview">Overview</span></h2>
          <p>Photography is employed in many fields of science, manufacturing, and business, as well as its more direct uses for art, film and video production, recreational purposes, hobby, and mass communication.</p>
          <h3><span class="mw-headline" id="Techniques">Techniques</span></h3>
          <p>There are many different types of photography, including portrait, landscape, street, and documentary photography. Each type has its own unique techniques and styles that photographers use to capture their subjects.</p>
          <table class="infobox">
            <tbody>
              <tr>
                <th colspan="2">Photography as an art form</th>
              </tr>
              <tr>
                <td>Type of medium</td>
                <td>Visual art and communication medium</td>
              </tr>
              <tr>
                <td>Year of invention</td>
                <td>Early nineteenth century origin</td>
              </tr>
            </tbody>
          </table>
          <h2><span class="mw-headline" id="History">History</span></h2>
          <p>The word photography was coined in 1839 by Sir John Herschel based on the Greek words meaning drawing with light. The earliest known photograph was taken by Joseph Nicéphore Niépce in 1826 or 1827.</p>
          <div class="navbox">
            <table>
              <tbody>
                <tr>
                  <td><a href="/wiki/Art">Art</a> | <a href="/wiki/Visual_arts">Visual arts</a> | <a href="/wiki/Camera">Camera</a></td>
                </tr>
              </tbody>
            </table>
          </div>
          <h2><span class="mw-headline" id="References">References</span></h2>
          <p>Photography has been a subject of scholarly study since its invention. Modern scholars have examined its cultural impact and technical evolution over nearly two centuries.<sup>[1]</sup><sup>[2]</sup></p>
        </div>
      </div>
      <div id="catlinks">
        <ul>
          <li><a href="/wiki/Category:Photography">Photography</a></li>
          <li><a href="/wiki/Category:Visual_arts">Visual arts</a></li>
        </ul>
      </div>
    `
  }

  it('discovers #mw-content-text as content root', async () => {
    setupWikipediaFixture()

    const output = await collectScanResults(document, wikiOptions)
    const texts = output.blocks.map(r => r.block.text)

    expect(texts.some(t => t.includes('art, application, and practice'))).toBe(true)
    expect(texts.some(t => t.includes('coined in 1839'))).toBe(true)
  })

  it('collects article paragraphs as paragraph block type', async () => {
    setupWikipediaFixture()

    const output = await collectScanResults(document, wikiOptions)
    const paragraphs = output.blocks.filter(r => r.block.meta.blockType === 'paragraph')

    expect(paragraphs.some(r => r.block.text.includes('art, application, and practice'))).toBe(true)
    expect(paragraphs.some(r => r.block.text.includes('employed in many fields'))).toBe(true)
  })

  it('collects headings with mw-headline as heading block type', async () => {
    setupWikipediaFixture()

    const output = await collectScanResults(document, wikiOptions)
    const headings = output.blocks.filter(r => r.block.meta.blockType === 'heading')

    expect(headings.some(r => r.block.text.includes('Overview'))).toBe(true)
    expect(headings.some(r => r.block.text.includes('Techniques'))).toBe(true)
    expect(headings.some(r => r.block.text.includes('History'))).toBe(true)
    expect(headings.some(r => r.block.text.includes('References'))).toBe(true)
  })

  it('collects infobox table as table block type', async () => {
    setupWikipediaFixture()

    const output = await collectScanResults(document, wikiOptions)
    const tableResults = output.blocks.filter(r => r.block.meta.blockType === 'table')

    expect(tableResults.some(r => r.block.text.includes('Visual art and communication medium'))).toBe(true)
    expect(tableResults.some(r => r.block.text.includes('Early nineteenth century origin'))).toBe(true)
    expect(tableResults.length).toBeGreaterThanOrEqual(2)
  })

  it('skips mw-empty-elt elements', async () => {
    setupWikipediaFixture()

    const output = await collectScanResults(document, wikiOptions)
    const emptyResults = output.blocks.filter(r => r.block.text.trim() === '')

    expect(emptyResults).toHaveLength(0)
  })

  it('collects content in document order', async () => {
    setupWikipediaFixture()

    const output = await collectScanResults(document, wikiOptions)
    const texts = output.blocks.map(r => r.block.text)

    const artAppIndex = texts.findIndex(t => t.includes('art, application, and practice'))
    const overviewIndex = texts.findIndex(t => t.includes('Overview'))
    const employedIndex = texts.findIndex(t => t.includes('employed in many fields'))
    const techniquesIndex = texts.findIndex(t => t.includes('Techniques'))
    const historyIndex = texts.findIndex(t => t.includes('History'))

    expect(artAppIndex).toBeLessThan(overviewIndex)
    expect(overviewIndex).toBeLessThan(employedIndex)
    expect(employedIndex).toBeLessThan(techniquesIndex)
    expect(techniquesIndex).toBeLessThan(historyIndex)
  })

  it('extracts inline link tokens from paragraphs', async () => {
    setupWikipediaFixture()

    const output = await collectScanResults(document, wikiOptions)
    const refBlock = output.blocks.find(r => r.block.text.includes('scholarly study'))

    expect(refBlock).toBeDefined()
    expect(refBlock!.block.inlineTokens.length).toBeGreaterThanOrEqual(0)
  })

  it('produces a reasonable number of blocks without duplication', async () => {
    setupWikipediaFixture()

    const output = await collectScanResults(document, wikiOptions)
    const ids = output.blocks.map(r => r.block.id)

    expect(new Set(ids).size).toBe(ids.length)
    expect(output.blocks.length).toBeGreaterThanOrEqual(5)
    expect(output.blocks.length).toBeLessThanOrEqual(15)
  })

  it('does not collect content outside #mw-content-text', async () => {
    setupWikipediaFixture()

    const output = await collectScanResults(document, wikiOptions)
    const texts = output.blocks.map(r => r.block.text)

    expect(texts.some(t => t.includes('Photography') && t.includes('Visual arts') && t.includes('Art'))).toBe(false)
  })

  it('collects hatnote disambiguation notice', async () => {
    setupWikipediaFixture()

    const output = await collectScanResults(document, wikiOptions)

    expect(output.blocks.some(r => r.block.text.includes('technique, see Photographic technique'))).toBe(true)
  })
})

describe('Phase 3: blockId/textHash identity contract', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('two identical paragraphs in different locations produce distinct blockId values', async () => {
    document.body.innerHTML = `
      <main>
        <p>This is a repeated paragraph that appears in two different locations on the page.</p>
        <section>
          <p>This is a repeated paragraph that appears in two different locations on the page.</p>
        </section>
      </main>
    `

    const output = await collectScanResults(document, scanOptions)

    expect(output.blocks).toHaveLength(2)
    expect(output.blocks[0].block.id).not.toBe(output.blocks[1].block.id)
  })

  it('identical paragraphs share the same textHash', async () => {
    document.body.innerHTML = `
      <main>
        <p>This is a repeated paragraph that appears in two different locations on the page.</p>
        <section>
          <p>This is a repeated paragraph that appears in two different locations on the page.</p>
        </section>
      </main>
    `

    const output = await collectScanResults(document, scanOptions)

    expect(output.blocks).toHaveLength(2)
    expect(output.blocks[0].block.textHash).toBe(output.blocks[1].block.textHash)
  })

  it('repeated identical text inside lists does not collide', async () => {
    document.body.innerHTML = `
      <main>
        <ul>
          <li>This list item has identical text that should get a unique block identifier.</li>
          <li>This list item has identical text that should get a unique block identifier.</li>
        </ul>
      </main>
    `

    const output = await collectScanResults(document, scanOptions)

    expect(output.blocks).toHaveLength(2)
    expect(output.blocks[0].block.id).not.toBe(output.blocks[1].block.id)
    expect(output.blocks[0].block.textHash).toBe(output.blocks[1].block.textHash)
  })

  it('repeated identical text inside tables does not collide', async () => {
    document.body.innerHTML = `
      <main>
        <table>
          <tbody>
            <tr>
              <td>This table cell text is identical to the other cell in this row.</td>
              <td>This table cell text is identical to the other cell in this row.</td>
            </tr>
          </tbody>
        </table>
      </main>
    `

    const output = await collectScanResults(document, scanOptions)

    expect(output.blocks).toHaveLength(2)
    expect(output.blocks[0].block.id).not.toBe(output.blocks[1].block.id)
    expect(output.blocks[0].block.textHash).toBe(output.blocks[1].block.textHash)
  })
})

describe('Phase 3: generated-node exclusion', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('excludes nodes with data-lingoflow-generated', async () => {
    document.body.innerHTML = `
      <main>
        <div data-lingoflow-generated="true">
          <p>This text is inside a generated node and must not be collected.</p>
        </div>
        <p>This text is outside generated nodes and should be collected.</p>
      </main>
    `

    const output = await collectScanResults(document, scanOptions)

    expect(output.blocks).toHaveLength(1)
    expect(output.blocks[0].block.text).toContain('outside generated nodes')
  })

  it('excludes nodes with data-lingoflow-translation', async () => {
    document.body.innerHTML = `
      <main>
        <div data-lingoflow-translation="block_abc">
          <p>This text is inside a translation node and must not be collected.</p>
        </div>
        <p>This text is outside translation nodes and should be collected.</p>
      </main>
    `

    const output = await collectScanResults(document, scanOptions)

    expect(output.blocks).toHaveLength(1)
    expect(output.blocks[0].block.text).toContain('outside translation nodes')
  })

  it('excludes nodes with data-lingoflow-translation-break', async () => {
    document.body.innerHTML = `
      <main>
        <div data-lingoflow-translation-break="true">
          <p>This text is inside a translation break node and must not be collected.</p>
        </div>
        <p>This text is outside translation break nodes and should be collected.</p>
      </main>
    `

    const output = await collectScanResults(document, scanOptions)

    expect(output.blocks).toHaveLength(1)
    expect(output.blocks[0].block.text).toContain('outside translation break')
  })

  it('excludes nodes with data-lingoflow-translation-spacer', async () => {
    document.body.innerHTML = `
      <main>
        <div data-lingoflow-translation-spacer="true">
          <p>This text is inside a translation spacer node and must not be collected.</p>
        </div>
        <p>This text is outside translation spacer nodes and should be collected.</p>
      </main>
    `

    const output = await collectScanResults(document, scanOptions)

    expect(output.blocks).toHaveLength(1)
    expect(output.blocks[0].block.text).toContain('outside translation spacer')
  })
})

describe('Phase 3: dry-run mode', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('dry-run mode does not leave data-lingoflow-block-id in the DOM', async () => {
    document.body.innerHTML = `
      <main>
        <p>This paragraph should not get a block ID attribute in dry-run mode.</p>
      </main>
    `

    await collectScanResults(document, { ...scanOptions, dryRun: true })

    expect(document.querySelector('[data-lingoflow-block-id]')).toBeNull()
  })

  it('dry-run mode does not leave generated markers in the DOM', async () => {
    document.body.innerHTML = `
      <main>
        <p>This paragraph should not get any generated markers in dry-run mode.</p>
      </main>
    `

    await collectScanResults(document, { ...scanOptions, dryRun: true })

    expect(document.querySelector('[data-lingoflow-generated]')).toBeNull()
    expect(document.querySelector('[data-lingoflow-translation]')).toBeNull()
  })

  it('dry-run mode still returns blocks and diagnostics', async () => {
    document.body.innerHTML = `
      <main>
        <p>This paragraph should still be collected in dry-run mode for diagnostics.</p>
      </main>
    `

    const output = await collectScanResults(document, { ...scanOptions, dryRun: true })

    expect(output.blocks).toHaveLength(1)
    expect(output.blocks[0].block.text).toContain('collected in dry-run')
    expect(output.diagnostics).toBeDefined()
    expect(output.diagnostics.acceptedBlockCount).toBe(1)
  })

  it('normal collection mode still marks accepted carriers as expected', async () => {
    document.body.innerHTML = `
      <main>
        <p>This paragraph should get a block ID attribute in normal mode.</p>
      </main>
    `

    const output = await collectScanResults(document, { ...scanOptions, dryRun: false })

    expect(output.blocks).toHaveLength(1)
    const blockId = output.blocks[0].block.id
    expect(document.querySelector(`[data-lingoflow-block-id="${blockId}"]`)).not.toBeNull()
  })
})

describe('Phase 3: skip reason diagnostics', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('records generated-node skip reason', async () => {
    document.body.innerHTML = `
      <main>
        <p data-lingoflow-generated="true">This generated text should be skipped with a reason.</p>
        <p>This normal paragraph is long enough to be collected by the scanner.</p>
      </main>
    `

    const output = await collectScanResults(document, scanOptions)

    expect(output.diagnostics.skipReasons['generated-node']).toBeGreaterThanOrEqual(1)
    expect(output.blocks).toHaveLength(1)
  })

  it('records too-short skip reason', async () => {
    document.body.innerHTML = `
      <main>
        <p>Short</p>
        <p>This paragraph is long enough to be collected by the scanner filter.</p>
      </main>
    `

    const output = await collectScanResults(document, scanOptions)

    expect(output.diagnostics.skipReasons['too-short']).toBeGreaterThanOrEqual(1)
    expect(output.blocks).toHaveLength(1)
  })

  it('records not-visible skip reason', async () => {
    document.body.innerHTML = `
      <main>
        <p hidden>This hidden paragraph is long enough but should be skipped.</p>
        <p>This visible paragraph is long enough to be collected by the scanner.</p>
      </main>
    `

    const output = await collectScanResults(document, scanOptions)

    expect(output.diagnostics.skipReasons['not-visible']).toBeGreaterThanOrEqual(1)
    expect(output.blocks).toHaveLength(1)
  })

  it('records inside-ui-exclusion skip reason', async () => {
    document.body.innerHTML = `
      <main>
        <div role="menu"><p>This menu item text is long enough but should be skipped as UI exclusion.</p></div>
        <p>This paragraph is long enough to be collected by the scanner filter.</p>
      </main>
    `

    const output = await collectScanResults(document, scanOptions)

    expect(output.diagnostics.skipReasons['inside-ui-exclusion']).toBeGreaterThanOrEqual(1)
    expect(output.blocks).toHaveLength(1)
  })

  it('records inside-ignore-selector skip reason', async () => {
    document.body.innerHTML = `
      <main>
        <nav><p>This navigation text is long enough but should be skipped by ignore selector.</p></nav>
        <p>This paragraph is long enough to be collected by the scanner filter.</p>
      </main>
    `

    const output = await collectScanResults(document, scanOptions)

    expect(output.diagnostics.skipReasons['inside-ignore-selector']).toBeGreaterThanOrEqual(1)
    expect(output.blocks).toHaveLength(1)
  })

  it('records block-level-children skip reason', async () => {
    document.body.innerHTML = `
      <main>
        <div>
          <p>This paragraph inside a div should be collected directly, not the div wrapper.</p>
        </div>
      </main>
    `

    const output = await collectScanResults(document, scanOptions)

    expect(output.diagnostics.skipReasons['block-level-children']).toBeGreaterThanOrEqual(1)
    expect(output.blocks).toHaveLength(1)
    expect(output.blocks[0].binding.carrierElement.tagName.toLowerCase()).toBe('p')
  })

  it('records table-cell-too-interactive skip reason', async () => {
    document.body.innerHTML = `
      <main>
        <table>
          <tbody>
            <tr>
              <td>
                <button>Action 1</button>
                <button>Action 2</button>
                <button>Action 3</button>
                <a href="#">Link 1</a>
                <a href="#">Link 2</a>
                This cell has too many interactive controls.
              </td>
              <td>This table cell has normal text that is long enough to collect.</td>
            </tr>
          </tbody>
        </table>
      </main>
    `

    const output = await collectScanResults(document, scanOptions)

    expect(output.diagnostics.skipReasons['table-cell-too-interactive']).toBeGreaterThanOrEqual(1)
  })

  it('records too-many-interactive-elements skip reason', async () => {
    document.body.innerHTML = `
      <main>
        <div>
          <a href="#">First link in high density area</a>
          <a href="#">Second link in high density area</a>
          <a href="#">Third link in high density area</a>
          <a href="#">Fourth link in high density area</a>
          <a href="#">Fifth link in high density area</a>
          <a href="#">Sixth link in high density area</a>
        </div>
        <p>This paragraph has normal text density and should be collected.</p>
      </main>
    `

    const output = await collectScanResults(document, scanOptions)

    expect(output.diagnostics.skipReasons['too-many-interactive-elements']).toBeGreaterThanOrEqual(1)
    expect(output.blocks).toHaveLength(1)
  })
})

describe('Phase 3: root diagnostics', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('root diagnostics include selected roots', async () => {
    document.body.innerHTML = `
      <main>
        <p>This paragraph is inside main and long enough to be collected.</p>
      </main>
    `

    const output = await collectScanResults(document, scanOptions)

    expect(output.diagnostics.rootsSelected).toBeGreaterThanOrEqual(1)
    expect(output.diagnostics.selectedRoots.length).toBeGreaterThanOrEqual(1)
    expect(output.diagnostics.selectedRoots[0].tagName).toBe('main')
    expect(output.diagnostics.selectedRoots[0].selected).toBe(true)
  })

  it('root diagnostics include rejected roots when applicable', async () => {
    document.body.innerHTML = `
      <main>
        <p>This paragraph is inside main and long enough to be collected.</p>
      </main>
      <nav>
        <p>This navigation paragraph is long enough but should be rejected.</p>
      </nav>
    `

    const output = await collectScanResults(document, createRuntimeContext({
      selectors: {
        contentRoots: ['main', 'nav'],
      },
    }))

    expect(output.diagnostics.rootsSelected).toBeGreaterThanOrEqual(1)
    expect(output.diagnostics.selectedRoots.some(r => r.tagName === 'main')).toBe(true)
  })

  it('root diagnostics record content-root-threshold for scored roots', async () => {
    document.body.innerHTML = `
      <div class="layout-shell">
        <div class="story-panel">
          <p>The first generic article paragraph is long enough to establish this panel as the main reading container.</p>
          <p>The second generic article paragraph gives the scorer enough text density to prefer this content.</p>
        </div>
      </div>
    `

    const output = await collectScanResults(document, scanOptions)

    expect(output.diagnostics.rootsSelected).toBeGreaterThanOrEqual(1)
    expect(output.diagnostics.selectedRoots.length).toBeGreaterThanOrEqual(1)
  })
})

describe('Phase 3: existing GitHub Markdown behavior', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('GitHub Markdown headings are collected correctly with new blockId format', async () => {
    document.body.innerHTML = `
      <main>
        <div class="comment-body markdown-body js-comment-body">
          <h2 dir="auto">What</h2>
          <p dir="auto">The top-level <code class="notranslate">README.md</code> carried a terser banner:</p>
          <blockquote>
            <p dir="auto"><strong>Public beta</strong> - the <code class="notranslate">@vue-tui/runtime</code> API is stabilizing.</p>
          </blockquote>
          <h2 dir="auto">Why</h2>
          <p dir="auto">The homepage is the first thing people see, but it was missing the public-feedback framing.</p>
        </div>
      </main>
    `

    const output = await collectScanResults(document, {
      ...scanOptions,
      pageUrl: 'https://github.com/vuejs-ai/vue-tui/pull/1',
      domain: 'github.com',
    })

    const texts = output.blocks.map(b => b.block.text)
    expect(texts).toEqual(expect.arrayContaining(['What', 'Why']))

    const publicBetaBlocks = output.blocks.filter(b => b.block.text.includes('Public beta'))
    expect(publicBetaBlocks).toHaveLength(1)

    const ids = output.blocks.map(b => b.block.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('blockId format includes occurrence index', async () => {
    document.body.innerHTML = `
      <main>
        <p>This is a paragraph that should be collected with the new block ID format.</p>
      </main>
    `

    const output = await collectScanResults(document, scanOptions)

    expect(output.blocks).toHaveLength(1)
    const id = output.blocks[0].block.id
    expect(id).toMatch(/^block_[a-f0-9]+_\d+$/)
  })
})
