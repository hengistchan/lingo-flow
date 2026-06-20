import type {
  BlockBinding,
  InsertionPlan,
  InsertionResult,
  PageDisplayMode,
  TranslationBlock,
  TranslationInsertion,
} from '@lingoflow/types'
import { applyDisplayMode, restoreSourceNodes } from './display-mode'

export interface InsertionStrategy {
  readonly name: TranslationInsertion
  canApply(block: TranslationBlock, binding: BlockBinding, mode: PageDisplayMode): boolean
  plan(block: TranslationBlock, binding: BlockBinding, mode: PageDisplayMode): InsertionPlan
  apply(plan: InsertionPlan): InsertionResult
  revert(result: InsertionResult): void
}

abstract class BaseInsertionStrategy implements InsertionStrategy {
  abstract readonly name: TranslationInsertion
  protected abstract readonly inlineTranslation: boolean
  abstract apply(plan: InsertionPlan): InsertionResult

  canApply(_block: TranslationBlock, binding: BlockBinding, _mode: PageDisplayMode): boolean {
    return binding.carrierElement.isConnected
  }

  plan(block: TranslationBlock, binding: BlockBinding, mode: PageDisplayMode): InsertionPlan {
    return {
      blockId: block.id,
      mode,
      target: binding.carrierElement,
      translationElement: createTranslationElement(block, binding.carrierElement.ownerDocument, this.inlineTranslation),
      placement: this.name,
      sourceNodesToHide: getHideableSourceNodes(binding),
    }
  }

  revert(result: InsertionResult) {
    for (const node of result.insertedNodes) {
      node.parentNode?.removeChild(node)
    }

    restoreSourceNodes(result.hiddenSourceNodes)
  }

  protected prepareTranslationElement(plan: InsertionPlan): HTMLElement {
    const translation = plan.translationElement
    translation.dataset.lingoflowTranslation = plan.blockId
    markGeneratedNode(translation, plan.blockId)
    translation.classList.add('lingoflow-translation')
    translation.classList.toggle('lingoflow-translation-inline', this.inlineTranslation)
    translation.classList.toggle('lingoflow-translation-block', !this.inlineTranslation)
    return translation
  }

  protected commit(plan: InsertionPlan, insertedNodes: Node[]): InsertionResult {
    const { hiddenSourceNodes } = applyDisplayMode({
      mode: plan.mode,
      sourceNodes: plan.sourceNodesToHide,
      insertedNodes,
    })

    return {
      blockId: plan.blockId,
      insertedNodes,
      hiddenSourceNodes,
    }
  }
}

export class LinebreakInsideStrategy extends BaseInsertionStrategy {
  readonly name = 'linebreak-inside' as const
  protected readonly inlineTranslation = true

  apply(plan: InsertionPlan): InsertionResult {
    const breakElement = plan.target.ownerDocument.createElement('br')
    breakElement.dataset.lingoflowTranslationBreak = plan.blockId
    markGeneratedNode(breakElement, plan.blockId)

    const translation = this.prepareTranslationElement(plan)
    plan.target.appendChild(breakElement)
    plan.target.appendChild(translation)

    return this.commit(plan, [breakElement, translation])
  }
}

export class InlineInsideStrategy extends BaseInsertionStrategy {
  readonly name = 'inline-inside' as const
  protected readonly inlineTranslation = true

  apply(plan: InsertionPlan): InsertionResult {
    const spacer = plan.target.ownerDocument.createElement('span')
    spacer.dataset.lingoflowTranslationSpacer = plan.blockId
    spacer.textContent = '  '
    markGeneratedNode(spacer, plan.blockId)

    const translation = this.prepareTranslationElement(plan)
    plan.target.appendChild(spacer)
    plan.target.appendChild(translation)

    return this.commit(plan, [spacer, translation])
  }
}

export class InsideContainerStrategy extends BaseInsertionStrategy {
  readonly name = 'inside-container' as const
  protected readonly inlineTranslation = false

  canApply(block: TranslationBlock, binding: BlockBinding, mode: PageDisplayMode): boolean {
    return super.canApply(block, binding, mode) && INSIDE_CONTAINER_TAGS.has(binding.carrierElement.tagName.toLowerCase())
  }

  apply(plan: InsertionPlan): InsertionResult {
    const translation = this.prepareTranslationElement(plan)
    plan.target.appendChild(translation)

    return this.commit(plan, [translation])
  }
}

export class BeforeNestedStructureStrategy extends BaseInsertionStrategy {
  readonly name = 'before-nested-structure' as const
  protected readonly inlineTranslation = false

  canApply(block: TranslationBlock, binding: BlockBinding, mode: PageDisplayMode): boolean {
    return super.canApply(block, binding, mode) && findNestedList(binding.carrierElement) !== null
  }

  apply(plan: InsertionPlan): InsertionResult {
    const translation = this.prepareTranslationElement(plan)
    const nestedList = findNestedList(plan.target)

    if (nestedList) {
      plan.target.insertBefore(translation, nestedList)
    } else {
      plan.target.appendChild(translation)
    }

    return this.commit(plan, [translation])
  }
}

export class AfterBlockStrategy extends BaseInsertionStrategy {
  readonly name = 'after-block' as const
  protected readonly inlineTranslation = false

  apply(plan: InsertionPlan): InsertionResult {
    const translation = this.prepareTranslationElement(plan)
    const target = findSafeBlockAncestor(plan.target)
    target.insertAdjacentElement('afterend', translation)

    return this.commit(plan, [translation])
  }
}

export function createTranslationElement(
  block: Pick<TranslationBlock, 'id' | 'translatedText' | 'targetLang'>,
  root: Document,
  inline: boolean,
): HTMLElement {
  const translation = root.createElement(inline ? 'span' : 'div')
  translation.dataset.lingoflowTranslation = block.id
  if (block.targetLang) translation.lang = block.targetLang
  translation.textContent = block.translatedText ?? ''
  return translation
}

function markGeneratedNode(element: HTMLElement, blockId: string) {
  element.classList.add('notranslate')
  element.dataset.lingoflowGenerated = 'true'
  element.setAttribute('translate', 'no')
}

function getHideableSourceNodes(binding: BlockBinding): HTMLElement[] {
  const sourceElements = binding.sourceNodes.filter((node): node is HTMLElement => node instanceof HTMLElement)
  return sourceElements.length > 0 ? sourceElements : []
}

function findNestedList(source: HTMLElement): Element | null {
  return Array.from(source.children).find(child => {
    const tagName = child.tagName.toLowerCase()
    return tagName === 'ul' || tagName === 'ol'
  }) ?? null
}

function findSafeBlockAncestor(source: HTMLElement): HTMLElement {
  if (!isInlineElement(source)) return source

  let current = source.parentElement
  while (current && current !== source.ownerDocument.body) {
    if (!isInlineElement(current)) return current
    current = current.parentElement
  }

  return source
}

function isInlineElement(element: HTMLElement): boolean {
  return !BLOCK_TAGS.has(element.tagName.toLowerCase())
}

const INSIDE_CONTAINER_TAGS = new Set(['li', 'td', 'th', 'figcaption'])

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
