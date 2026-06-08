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
