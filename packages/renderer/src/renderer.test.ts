import { clearTranslations, injectLingoFlowStyles, renderBelowOriginal, safeRender } from './index'

describe('renderer', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
  })

  it('renders translated text below original without injecting provider HTML', () => {
    document.body.innerHTML = '<p data-lingoflow-block-id="block_1">Original paragraph.</p>'

    renderBelowOriginal({
      blockId: 'block_1',
      translatedText: '<strong>中文译文</strong>',
    })

    const translation = document.querySelector('[data-lingoflow-translation="block_1"]') as HTMLElement
    expect(translation).not.toBeNull()
    expect(translation.textContent).toBe('<strong>中文译文</strong>')
    expect(translation.querySelector('strong')).toBeNull()
  })

  it('renders linebreak-inside translations inside paragraphs', () => {
    document.body.innerHTML = '<p data-lingoflow-block-id="block_para">Original paragraph.</p>'

    renderBelowOriginal({
      blockId: 'block_para',
      translatedText: '段落译文',
      insertion: 'linebreak-inside',
    })

    const paragraph = document.querySelector('p') as HTMLElement
    const translation = document.querySelector('[data-lingoflow-translation="block_para"]') as HTMLElement
    expect(translation.parentElement).toBe(paragraph)
    expect(translation.tagName.toLowerCase()).toBe('span')
    expect(translation.classList.contains('notranslate')).toBe(true)
    expect(translation.previousSibling?.nodeName).toBe('BR')
  })

  it('renders inline-inside translations inside compact headings', () => {
    document.body.innerHTML = '<h2 data-lingoflow-block-id="block_heading">What</h2>'

    renderBelowOriginal({
      blockId: 'block_heading',
      translatedText: '什么',
      insertion: 'inline-inside',
    })

    const heading = document.querySelector('h2') as HTMLElement
    const translation = document.querySelector('[data-lingoflow-translation="block_heading"]') as HTMLElement
    expect(translation.parentElement).toBe(heading)
    expect(translation.tagName.toLowerCase()).toBe('span')
    expect(translation.previousSibling?.textContent).toBe('  ')
  })

  it('keeps primary title link translations inside the source anchor', () => {
    document.body.innerHTML = `
      <h3>
        <a data-lingoflow-block-id="block_link" href="/repo/pull/208">
          docs(readme): align the homepage status banner
          <span>#208</span>
        </a>
      </h3>
    `

    renderBelowOriginal({
      blockId: 'block_link',
      translatedText: '文档（自述文件）：将首页状态横幅对齐 #208',
      insertion: 'linebreak-inside',
    })

    const anchor = document.querySelector('a') as HTMLElement
    const translation = document.querySelector('[data-lingoflow-translation="block_link"]') as HTMLElement
    expect(translation.parentElement).toBe(anchor)
    expect(anchor.nextElementSibling).toBeNull()
    expect(translation.previousSibling?.nodeName).toBe('BR')
  })

  it('renders list item translations inside the source list item', () => {
    document.body.innerHTML = `
      <ul>
        <li data-lingoflow-block-id="block_li">Original list item content that stays in the list.</li>
      </ul>
    `

    renderBelowOriginal({ blockId: 'block_li', translatedText: '列表项译文' })

    const translation = document.querySelector('[data-lingoflow-translation="block_li"]') as HTMLElement
    expect(translation.parentElement?.tagName.toLowerCase()).toBe('li')
    expect(document.querySelector('ul')?.children).toHaveLength(1)
  })

  it('places parent list item translations before nested child lists', () => {
    document.body.innerHTML = `
      <ul>
        <li data-lingoflow-block-id="block_parent">
          <p><strong>Discounts:</strong> Parent list item summary should be translated before nested items.</p>
          <ul>
            <li data-lingoflow-block-id="block_child">Nested child item should remain after the parent translation.</li>
          </ul>
        </li>
      </ul>
    `

    renderBelowOriginal({ blockId: 'block_parent', translatedText: '父级列表项译文' })

    const parent = document.querySelector('[data-lingoflow-block-id="block_parent"]') as HTMLElement
    const translation = document.querySelector('[data-lingoflow-translation="block_parent"]') as HTMLElement
    expect(translation.parentElement).toBe(parent)
    expect(translation.previousElementSibling?.tagName.toLowerCase()).toBe('p')
    expect(translation.nextElementSibling?.tagName.toLowerCase()).toBe('ul')
  })

  it('renders table cell translations inside the source cell', () => {
    document.body.innerHTML = `
      <table>
        <tbody>
          <tr>
            <td data-lingoflow-block-id="block_cell">Original table cell content that stays in the cell.</td>
          </tr>
        </tbody>
      </table>
    `

    renderBelowOriginal({ blockId: 'block_cell', translatedText: '表格单元格译文' })

    const translation = document.querySelector('[data-lingoflow-translation="block_cell"]') as HTMLElement
    expect(translation.parentElement?.tagName.toLowerCase()).toBe('td')
    expect(document.querySelector('tr')?.children).toHaveLength(1)
  })

  it('promotes inline source nodes to the nearest block ancestor before inserting translation', () => {
    document.body.innerHTML = `
      <p>Read <span data-lingoflow-block-id="block_inline">this important inline phrase</span> before continuing.</p>
    `

    renderBelowOriginal({ blockId: 'block_inline', translatedText: '行内短语译文' })

    const translation = document.querySelector('[data-lingoflow-translation="block_inline"]') as HTMLElement
    expect(translation.parentElement).toBe(document.body)
    expect(translation.previousElementSibling?.tagName.toLowerCase()).toBe('p')
  })

  it('clears inserted translations and block ids without removing original content', () => {
    document.body.innerHTML = '<p data-lingoflow-block-id="block_1">Original paragraph.</p>'
    renderBelowOriginal({ blockId: 'block_1', translatedText: '中文译文' })

    clearTranslations()

    expect(document.querySelector('[data-lingoflow-translation]')).toBeNull()
    expect(document.querySelector('p')?.textContent).toBe('Original paragraph.')
    expect(document.querySelector('p')?.getAttribute('data-lingoflow-block-id')).toBeNull()
  })

  it('clears linebreak-inside wrappers and generated breaks', () => {
    document.body.innerHTML = '<p data-lingoflow-block-id="block_1">Original paragraph.</p>'
    renderBelowOriginal({ blockId: 'block_1', translatedText: '中文译文', insertion: 'linebreak-inside' })

    clearTranslations()

    expect(document.querySelector('[data-lingoflow-translation]')).toBeNull()
    expect(document.querySelector('[data-lingoflow-translation-break]')).toBeNull()
    expect(document.querySelector('p')?.innerHTML).toBe('Original paragraph.')
  })

  it('injects styles once and safeRender skips missing nodes', () => {
    injectLingoFlowStyles()
    injectLingoFlowStyles()
    safeRender({ blockId: 'missing', translatedText: '不会抛出' })

    expect(document.querySelectorAll('#lingoflow-style')).toHaveLength(1)
  })
})
