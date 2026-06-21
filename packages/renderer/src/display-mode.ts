import type { InsertionResult, PageDisplayMode } from '@lingoflow/types'

export type DisplayModeInput = {
  mode: PageDisplayMode
  sourceNodes: HTMLElement[]
  insertedNodes: Node[]
}

export function applyDisplayMode(input: DisplayModeInput): Pick<InsertionResult, 'hiddenSourceNodes'> {
  if (input.mode === 'original') {
    restoreSourceNodes(input.sourceNodes)
    setInsertedNodesVisible(input.insertedNodes, false)
    return { hiddenSourceNodes: [] }
  }

  setInsertedNodesVisible(input.insertedNodes, true)

  if (input.mode === 'translation') {
    return { hiddenSourceNodes: hideSourceNodes(input.sourceNodes) }
  }

  restoreSourceNodes(input.sourceNodes)
  return { hiddenSourceNodes: [] }
}

export function hideSourceNodes(sourceNodes: HTMLElement[]): HTMLElement[] {
  const hidden: HTMLElement[] = []

  for (const source of sourceNodes) {
    const sourceContent = createSourceContentWrapper(source)
    hidden.push(hideSourceElement(sourceContent ?? source))
  }

  return hidden
}

export function restoreSourceNodes(sourceNodes: HTMLElement[]) {
  for (const source of collectRestorableSourceNodes(sourceNodes)) {
    if (source.dataset.lingoflowSourceWasHidden !== 'true') {
      source.hidden = false
    }

    if (source.dataset.lingoflowSourceWasNotranslate !== 'true') {
      source.classList.remove('notranslate')
    }

    delete source.dataset.lingoflowSourceHidden
    delete source.dataset.lingoflowSourceWasHidden
    delete source.dataset.lingoflowSourceWasNotranslate

    unwrapSourceContent(source)
  }
}

export function setInsertedNodesVisible(insertedNodes: Node[], visible: boolean) {
  for (const node of insertedNodes) {
    if (node instanceof HTMLElement) {
      node.hidden = !visible
    }
  }
}

function hideSourceElement(source: HTMLElement): HTMLElement {
  if (source.dataset.lingoflowSourceHidden !== 'true') {
    source.dataset.lingoflowSourceWasHidden = source.hidden ? 'true' : 'false'
    source.dataset.lingoflowSourceWasNotranslate = source.classList.contains('notranslate') ? 'true' : 'false'
  }

  source.dataset.lingoflowSourceHidden = 'true'
  source.classList.add('notranslate')
  source.hidden = true
  return source
}

function createSourceContentWrapper(source: HTMLElement): HTMLElement | null {
  const firstGeneratedChild = findFirstGeneratedChild(source)
  if (!firstGeneratedChild) return null

  const sourceNodes: ChildNode[] = []
  let current = source.firstChild

  while (current && current !== firstGeneratedChild) {
    sourceNodes.push(current)
    current = current.nextSibling
  }

  if (sourceNodes.length === 0) return null
  if (sourceNodes.length === 1 && isSourceContentWrapper(sourceNodes[0])) {
    return sourceNodes[0]
  }

  const wrapper = source.ownerDocument.createElement('span')
  wrapper.dataset.lingoflowSourceWrapper = 'true'
  source.insertBefore(wrapper, firstGeneratedChild)

  for (const node of sourceNodes) {
    wrapper.appendChild(node)
  }

  return wrapper
}

function unwrapSourceContent(source: HTMLElement) {
  if (!isSourceContentWrapper(source)) return

  const parent = source.parentNode
  if (!parent) return

  while (source.firstChild) {
    parent.insertBefore(source.firstChild, source)
  }
  parent.removeChild(source)
}

function collectRestorableSourceNodes(sourceNodes: HTMLElement[]): HTMLElement[] {
  const restorable: HTMLElement[] = []
  const seen = new Set<HTMLElement>()

  for (const source of sourceNodes) {
    addRestorableSourceNode(source, restorable, seen)
    for (const hiddenDescendant of source.querySelectorAll<HTMLElement>('[data-lingoflow-source-hidden="true"]')) {
      addRestorableSourceNode(hiddenDescendant, restorable, seen)
    }
  }

  return restorable
}

function addRestorableSourceNode(
  source: HTMLElement,
  restorable: HTMLElement[],
  seen: Set<HTMLElement>,
) {
  if (seen.has(source)) return
  seen.add(source)
  restorable.push(source)
}

function findFirstGeneratedChild(source: HTMLElement): ChildNode | null {
  for (const child of Array.from(source.childNodes)) {
    if (isGeneratedChild(child)) return child
  }
  return null
}

function isGeneratedChild(node: Node): boolean {
  return node instanceof HTMLElement && (
    node.dataset.lingoflowGenerated === 'true' ||
    node.dataset.lingoflowTranslation !== undefined ||
    node.dataset.lingoflowTranslationBreak !== undefined ||
    node.dataset.lingoflowTranslationSpacer !== undefined
  )
}

function isSourceContentWrapper(node: Node): node is HTMLElement {
  return node instanceof HTMLElement && node.dataset.lingoflowSourceWrapper === 'true'
}
