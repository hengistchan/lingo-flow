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

  it('injects styles once and safeRender skips missing nodes', () => {
    injectLingoFlowStyles()
    injectLingoFlowStyles()
    safeRender({ blockId: 'missing', translatedText: '不会抛出' })

    expect(document.querySelectorAll('#lingoflow-style')).toHaveLength(1)
  })
})
