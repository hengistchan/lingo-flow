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
    if (source.dataset.lingoflowSourceHidden !== 'true') {
      source.dataset.lingoflowSourceWasHidden = source.hidden ? 'true' : 'false'
      source.dataset.lingoflowSourceWasNotranslate = source.classList.contains('notranslate') ? 'true' : 'false'
    }

    source.dataset.lingoflowSourceHidden = 'true'
    source.classList.add('notranslate')
    source.hidden = true
    hidden.push(source)
  }

  return hidden
}

export function restoreSourceNodes(sourceNodes: HTMLElement[]) {
  for (const source of sourceNodes) {
    if (source.dataset.lingoflowSourceWasHidden !== 'true') {
      source.hidden = false
    }

    if (source.dataset.lingoflowSourceWasNotranslate !== 'true') {
      source.classList.remove('notranslate')
    }

    delete source.dataset.lingoflowSourceHidden
    delete source.dataset.lingoflowSourceWasHidden
    delete source.dataset.lingoflowSourceWasNotranslate
  }
}

export function setInsertedNodesVisible(insertedNodes: Node[], visible: boolean) {
  for (const node of insertedNodes) {
    if (node instanceof HTMLElement) {
      node.hidden = !visible
    }
  }
}
