import type { InsertionPlan, TranslationInsertion } from '@lingoflow/types'
import { findAllShadowRoots } from '@lingoflow/shared'
import { restoreSourceNodes } from './display-mode'
import { defaultStrategyRegistry } from './registry'
import { createTranslationElement } from './strategies'

export * from './display-mode'
export * from './registry'
export * from './strategies'

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
    .lingoflow-translation-wrapper {
      contain: content;
    }
    .lingoflow-translation-inner {
      white-space: pre-wrap;
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
