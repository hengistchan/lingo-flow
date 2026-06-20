import type { TranslationInsertion } from '@lingoflow/types'

export type RenderInput = {
  blockId: string
  translatedText?: string
  insertion?: TranslationInsertion
  targetLang?: string
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
      border-left: 2px solid #c05a2e;
      color: #6b6560;
      font-size: 0.95em;
      line-height: 1.65;
      word-break: break-word;
    }
    .lingoflow-translation-inline {
      display: inline;
      margin: 0;
      padding-left: 0;
      border-left: 0;
    }
    .lingoflow-translation-block {
      display: block;
    }
    @media (prefers-color-scheme: dark) {
      .lingoflow-translation {
        border-left-color: #d4764e;
        color: #9e978c;
      }
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

  const insertion = input.insertion ?? inferInsertionFromElement(element)
  const translation = createTranslationElement(root, input, insertion)

  insertTranslationElement(element, translation, insertion)
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
  root.querySelectorAll('[data-lingoflow-translation-break]').forEach(node => node.remove())
  root.querySelectorAll('[data-lingoflow-translation-spacer]').forEach(node => node.remove())

  root.querySelectorAll('[data-lingoflow-block-id]').forEach(node => {
    if (node instanceof HTMLElement) {
      delete node.dataset.lingoflowBlockId
      node.removeAttribute('data-lingoflow-block-id')
    }
  })
}

function findAllShadowRoots(root: Element | Document): ShadowRoot[] {
  const shadows: ShadowRoot[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)
  let node: Node | null = walker.currentNode
  while (node) {
    if (node instanceof Element && node.shadowRoot) shadows.push(node.shadowRoot)
    node = walker.nextNode()
  }
  return shadows
}

function findBlockElement(blockId: string, root: Document): HTMLElement | null {
  const selector = `[data-lingoflow-block-id="${blockId}"]`
  let element = root.querySelector(selector)
  if (element instanceof HTMLElement) return element

  const shadows = findAllShadowRoots(root.documentElement)
  for (const shadow of shadows) {
    element = shadow.querySelector(selector)
    if (element instanceof HTMLElement) return element
  }

  return null
}

function createTranslationElement(
  root: Document,
  input: RenderInput,
  insertion: TranslationInsertion,
): HTMLElement {
  const isInline = insertion === 'inline-inside' || insertion === 'linebreak-inside'
  const translation = root.createElement(isInline ? 'span' : 'div')
  translation.className = [
    'notranslate',
    'lingoflow-translation',
    isInline ? 'lingoflow-translation-inline' : 'lingoflow-translation-block',
  ].join(' ')
  translation.dataset.lingoflowTranslation = input.blockId
  if (input.targetLang) translation.lang = input.targetLang
  translation.textContent = input.translatedText ?? ''
  return translation
}

function insertTranslationElement(
  source: HTMLElement,
  translation: HTMLElement,
  insertion: TranslationInsertion,
) {
  if (insertion === 'linebreak-inside') {
    insertLinebreakInsideTranslation(source, translation)
    return
  }

  if (insertion === 'inline-inside') {
    insertInlineInsideTranslation(source, translation)
    return
  }

  if (insertion === 'before-nested-structure') {
    insertListItemTranslation(source, translation)
    return
  }

  if (insertion === 'inside-container') {
    source.appendChild(translation)
    return
  }

  const placement = resolvePlacement(source)

  if (placement.mode === 'inside') {
    placement.target.appendChild(translation)
    return
  }

  placement.target.insertAdjacentElement('afterend', translation)
}

function insertLinebreakInsideTranslation(source: HTMLElement, translation: HTMLElement) {
  const br = source.ownerDocument.createElement('br')
  br.dataset.lingoflowTranslationBreak = translation.dataset.lingoflowTranslation ?? ''
  source.appendChild(br)
  source.appendChild(translation)
}

function insertInlineInsideTranslation(source: HTMLElement, translation: HTMLElement) {
  const spacer = source.ownerDocument.createElement('span')
  spacer.dataset.lingoflowTranslationSpacer = translation.dataset.lingoflowTranslation ?? ''
  spacer.className = 'notranslate'
  spacer.textContent = '  '
  source.appendChild(spacer)
  source.appendChild(translation)
}

function insertListItemTranslation(source: HTMLElement, translation: HTMLElement) {
  const nestedList = Array.from(source.children).find(child => {
    const tagName = child.tagName.toLowerCase()
    return tagName === 'ul' || tagName === 'ol'
  })

  if (nestedList) {
    source.insertBefore(translation, nestedList)
    return
  }

  source.appendChild(translation)
}

function resolvePlacement(source: HTMLElement): {
  mode: 'after' | 'inside'
  target: HTMLElement
} {
  const tagName = source.tagName.toLowerCase()

  if (tagName === 'li' || tagName === 'td' || tagName === 'th') {
    return { mode: 'inside', target: source }
  }

  if (isInlineElement(source)) {
    return { mode: 'after', target: findNearestBlockAncestor(source) ?? source }
  }

  return { mode: 'after', target: source }
}

function findNearestBlockAncestor(source: HTMLElement): HTMLElement | null {
  let current = source.parentElement

  while (current && current !== source.ownerDocument.body) {
    if (!isInlineElement(current)) return current
    current = current.parentElement
  }

  return null
}

function isInlineElement(element: HTMLElement): boolean {
  const tagName = element.tagName.toLowerCase()
  return !BLOCK_TAGS.has(tagName)
}

function inferInsertionFromElement(source: HTMLElement): TranslationInsertion {
  const tagName = source.tagName.toLowerCase()
  if (tagName === 'li') return hasNestedList(source) ? 'before-nested-structure' : 'inside-container'
  if (tagName === 'td' || tagName === 'th') return 'inside-container'
  return 'after-block'
}

function hasNestedList(source: HTMLElement): boolean {
  return Array.from(source.children).some(child => {
    const tagName = child.tagName.toLowerCase()
    return tagName === 'ul' || tagName === 'ol'
  })
}

const BLOCK_TAGS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'dd',
  'div',
  'dl',
  'dt',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
])
