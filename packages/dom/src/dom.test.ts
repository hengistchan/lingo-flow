import { collectTextBlocks, isTranslatableElement } from './index'

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
