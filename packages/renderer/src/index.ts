export type RenderInput = {
  blockId: string
  translatedText?: string
}

export function injectLingoFlowStyles(root: Document = document) {
  if (root.getElementById('lingoflow-style')) return

  const style = root.createElement('style')
  style.id = 'lingoflow-style'
  style.textContent = `
    .lingoflow-translation {
      margin-top: 0.35em;
      margin-bottom: 0.85em;
      padding-left: 0.75em;
      border-left: 3px solid #20D4BF;
      color: #0F9F91;
      font-size: 0.95em;
      line-height: 1.65;
      word-break: break-word;
    }
  `

  root.documentElement.appendChild(style)
}

export function renderBelowOriginal(input: RenderInput, root: Document = document) {
  if (!input.translatedText) return

  injectLingoFlowStyles(root)

  const element = findBlockElement(input.blockId, root)
  if (!element) throw new Error(`DOM node missing for block ${input.blockId}`)

  const existing = root.querySelector(`[data-lingoflow-translation="${input.blockId}"]`)
  if (existing instanceof HTMLElement) {
    existing.textContent = input.translatedText
    return
  }

  const translation = root.createElement('div')
  translation.className = 'lingoflow-translation'
  translation.dataset.lingoflowTranslation = input.blockId
  translation.textContent = input.translatedText

  element.insertAdjacentElement('afterend', translation)
}

export function safeRender(input: RenderInput, root: Document = document) {
  try {
    renderBelowOriginal(input, root)
  } catch (error) {
    console.warn('[LingoFlow] Render failed', {
      blockId: input.blockId,
      error,
    })
  }
}

export function clearTranslations(root: Document = document) {
  root.querySelectorAll('[data-lingoflow-translation]').forEach(node => node.remove())

  root.querySelectorAll('[data-lingoflow-block-id]').forEach(node => {
    if (node instanceof HTMLElement) {
      delete node.dataset.lingoflowBlockId
      node.removeAttribute('data-lingoflow-block-id')
    }
  })
}

function findBlockElement(blockId: string, root: Document): HTMLElement | null {
  const elements = root.querySelectorAll('[data-lingoflow-block-id]')

  for (const element of elements) {
    if (element instanceof HTMLElement && element.dataset.lingoflowBlockId === blockId) {
      return element
    }
  }

  return null
}
