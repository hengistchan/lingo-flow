import type { InsertionPlan, TranslationInsertion, TranslationPosition } from '@lingoflow/types'
import { findAllShadowRoots } from '@lingoflow/shared'
import { restoreSourceNodes } from './display-mode'
import { defaultStrategyRegistry } from './registry'
import {
  createTranslationElement,
  ensureTranslationInner,
  findSafeBlockAncestor,
  markGeneratedNode,
} from './strategies'

export * from './display-mode'
export * from './registry'
export * from './strategies'

export type RenderInput = {
  blockId: string
  translatedText?: string
  insertion?: TranslationInsertion
  translationPosition?: TranslationPosition
  targetLang?: string
}

export type PartialTranslationRenderInput = {
  id: string
  sourceElement: HTMLElement
  sourceKey: string
  sourceOrder: number
  translatedText?: string
  targetLang?: string
  state: 'loading' | 'success' | 'error'
}

export function injectLingoFlowStyles(root: Document | ShadowRoot = document) {
  if (typeof root.getElementById !== 'function') return
  if (root.getElementById('lingoflow-style')) return

  const isDocument = root.nodeType === 9
  const ownerDocument = (isDocument ? root : root.ownerDocument) as Document
  const style = ownerDocument.createElement('style')
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
    .lingoflow-translation-wrapper {
      contain: content;
    }
    .lingoflow-translation-inner {
      white-space: pre-wrap;
    }
    .lingoflow-partial-translation-group {
      display: block;
    }
    .lingoflow-loading {
      opacity: 0.5;
    }
    .lingoflow-dot {
      display: inline-block;
      width: 4px;
      height: 4px;
      margin: 0 2px;
      border-radius: 50%;
      background: currentColor;
      animation: lingoflow-dot-pulse 1.4s ease-in-out infinite;
    }
    .lingoflow-dot:nth-child(2) { animation-delay: 0.16s; }
    .lingoflow-dot:nth-child(3) { animation-delay: 0.32s; }
    @keyframes lingoflow-dot-pulse {
      0%, 80%, 100% { opacity: 0.3; transform: scale(1); }
      40% { opacity: 1; transform: scale(1); }
    }
    .lingoflow-error {
      border-left-color: #b3261e;
      color: #b3261e;
    }
    @media (prefers-color-scheme: dark) {
      .lingoflow-translation {
        border-left-color: #d4764e;
        color: #9e978c;
      }
      .lingoflow-error {
        border-left-color: #ffb4ab;
        color: #ffb4ab;
      }
    }
  `

  if (isDocument) (root as Document).documentElement.appendChild(style)
  else root.appendChild(style)
}

export function renderBelowOriginal(input: RenderInput, root: Document = document) {
  if (!input.translatedText) return

  injectLingoFlowStyles(root)

  const element = findBlockElement(input.blockId, root)
  if (!element) throw new Error(`DOM node missing for block ${input.blockId}`)

  const existing = root.querySelector(`[data-lingoflow-translation="${input.blockId}"]`)
  if (existing instanceof HTMLElement) {
    const inner = existing.querySelector('.lingoflow-translation-inner')
    if (inner instanceof HTMLElement) {
      inner.textContent = input.translatedText
    } else {
      existing.textContent = input.translatedText
    }
    existing.hidden = false
    if (input.targetLang) existing.lang = input.targetLang
    return
  }

  const insertion = input.insertion ?? inferInsertionFromElement(element)
  const strategy = defaultStrategyRegistry.get(insertion) ?? defaultStrategyRegistry.get('after-block')
  if (!strategy) throw new Error(`Renderer strategy missing for ${insertion}`)

  strategy.apply(createCompatibilityPlan(input, root, element, insertion))
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

export function renderPartialTranslation(input: PartialTranslationRenderInput): HTMLElement {
  const nodeRoot = input.sourceElement.getRootNode()
  const root = isShadowRoot(nodeRoot) ? nodeRoot : input.sourceElement.ownerDocument
  injectLingoFlowStyles(root)

  const group = findOrCreatePartialTranslationGroup(input, root)
  let translation = Array.from(group.children).find(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && child.dataset.lingoflowTranslation === input.id,
  )

  if (!(translation instanceof HTMLElement)) {
    translation = createTranslationElement({
      id: input.id,
      translatedText: input.translatedText,
      targetLang: input.targetLang ?? '',
    }, input.sourceElement.ownerDocument, false)
    preparePartialTranslationElement(translation, input)
  }

  updatePartialTranslationElement(translation, input)
  insertPartialTranslationInOrder(group, translation, input.sourceOrder)
  return translation
}

export function clearPartialTranslations(root: Document | ShadowRoot = document): void {
  const roots = [root, ...findNestedShadowRoots(root)]
  for (const currentRoot of roots) {
    currentRoot.querySelectorAll('[data-lingoflow-partial-translation-group]').forEach(node => node.remove())
  }
}

export function clearTranslations(root: Document = document) {
  restoreSourceNodes(Array.from(root.querySelectorAll<HTMLElement>('[data-lingoflow-source-hidden="true"]')))

  const generatedNodes = new Set<Node>([
    ...root.querySelectorAll('[data-lingoflow-generated="true"]'),
    ...root.querySelectorAll('[data-lingoflow-translation]'),
    ...root.querySelectorAll('[data-lingoflow-translation-break]'),
    ...root.querySelectorAll('[data-lingoflow-translation-spacer]'),
  ])

  for (const node of generatedNodes) {
    node.parentNode?.removeChild(node)
  }

  root.querySelectorAll('[data-lingoflow-block-id]').forEach(node => {
    if (node instanceof HTMLElement) {
      delete node.dataset.lingoflowBlockId
      node.removeAttribute('data-lingoflow-block-id')
    }
  })
}

function findOrCreatePartialTranslationGroup(
  input: PartialTranslationRenderInput,
  root: Document | ShadowRoot,
): HTMLElement {
  const existing = Array.from(root.querySelectorAll<HTMLElement>('[data-lingoflow-partial-translation-group]'))
    .find(group => group.dataset.lingoflowPartialTranslationGroup === input.sourceKey)
  if (existing) return existing

  const group = input.sourceElement.ownerDocument.createElement('div')
  group.className = 'lingoflow-partial-translation-group notranslate'
  group.dataset.lingoflowPartialTranslationGroup = input.sourceKey
  group.dataset.lingoflowGenerated = 'true'
  group.setAttribute('translate', 'no')
  insertPartialTranslationGroup(input.sourceElement, group)
  return group
}

function insertPartialTranslationGroup(source: HTMLElement, group: HTMLElement): void {
  const tagName = source.tagName.toLowerCase()
  if (tagName === 'li') {
    const nestedList = Array.from(source.children).find(child => {
      const childTag = child.tagName.toLowerCase()
      return childTag === 'ul' || childTag === 'ol'
    })
    if (nestedList) source.insertBefore(group, nestedList)
    else source.appendChild(group)
    return
  }

  if (tagName === 'td' || tagName === 'th' || tagName === 'figcaption') {
    source.appendChild(group)
    return
  }

  const block = findSafeBlockAncestor(source)
  if (block.parentNode) block.parentNode.insertBefore(group, block.nextSibling)
  else block.appendChild(group)
}

function preparePartialTranslationElement(
  translation: HTMLElement,
  input: PartialTranslationRenderInput,
): void {
  const placement = inferInsertionFromElement(input.sourceElement)
  translation.dataset.lingoflowTranslation = input.id
  translation.dataset.lingoflowPartialTranslation = 'true'
  translation.dataset.lingoflowMode = 'dual'
  translation.dataset.lingoflowPosition = placement
  translation.dataset.lingoflowTheme = 'system'
  translation.classList.add(
    'lingoflow-translation',
    'lingoflow-translation-block',
    'lingoflow-translation-wrapper',
    'lingoflow-translation-wrapper-block',
  )
  markGeneratedNode(translation, input.id)
}

function updatePartialTranslationElement(
  translation: HTMLElement,
  input: PartialTranslationRenderInput,
): void {
  translation.dataset.lingoflowPartialOrder = String(input.sourceOrder)
  translation.dataset.lingoflowPartialState = input.state
  translation.classList.toggle('lingoflow-loading', input.state === 'loading')
  translation.classList.toggle('lingoflow-error', input.state === 'error')
  translation.setAttribute('aria-live', 'polite')
  translation.setAttribute('role', input.state === 'error' ? 'alert' : 'status')
  if (input.targetLang) translation.lang = input.targetLang

  const inner = ensureTranslationInner(translation, false)
  inner.replaceChildren()
  if (input.state === 'loading') {
    for (let index = 0; index < 3; index += 1) {
      const dot = translation.ownerDocument.createElement('span')
      dot.className = 'lingoflow-dot'
      inner.appendChild(dot)
    }
  } else {
    inner.textContent = input.translatedText ?? ''
  }
}

function insertPartialTranslationInOrder(
  group: HTMLElement,
  translation: HTMLElement,
  sourceOrder: number,
): void {
  const next = Array.from(group.children).find(child => {
    if (!(child instanceof HTMLElement) || child === translation) return false
    return Number(child.dataset.lingoflowPartialOrder ?? Number.MAX_SAFE_INTEGER) > sourceOrder
  })
  group.insertBefore(translation, next ?? null)
}

function createCompatibilityPlan(
  input: RenderInput,
  root: Document,
  element: HTMLElement,
  insertion: TranslationInsertion,
): InsertionPlan {
  const inline = insertion === 'inline-inside' || insertion === 'linebreak-inside'
  const translationElement = createTranslationElement({
    id: input.blockId,
    translatedText: input.translatedText,
    targetLang: input.targetLang ?? '',
  }, root, inline)

  return {
    blockId: input.blockId,
    mode: 'dual',
    target: element,
    translationElement,
    placement: insertion,
    position: input.translationPosition ?? 'after',
    sourceNodesToHide: [],
  }
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

function inferInsertionFromElement(source: HTMLElement): TranslationInsertion {
  const tagName = source.tagName.toLowerCase()
  if (tagName === 'li') return hasNestedList(source) ? 'before-nested-structure' : 'inside-container'
  if (tagName === 'td' || tagName === 'th' || tagName === 'figcaption') return 'inside-container'
  return 'after-block'
}

function hasNestedList(source: HTMLElement): boolean {
  return Array.from(source.children).some(child => {
    const tagName = child.tagName.toLowerCase()
    return tagName === 'ul' || tagName === 'ol'
  })
}

function findNestedShadowRoots(root: Document | ShadowRoot): ShadowRoot[] {
  const shadows: ShadowRoot[] = []
  for (const element of root.querySelectorAll('*')) {
    const shadow = element.shadowRoot
    if (!shadow) continue
    shadows.push(shadow, ...findNestedShadowRoots(shadow))
  }
  return shadows
}

function isShadowRoot(root: Node): root is ShadowRoot {
  return root.nodeType === 11 && 'host' in root
}
