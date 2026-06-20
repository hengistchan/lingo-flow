export function findAllShadowRoots(root: Element | Document): ShadowRoot[] {
  const shadows: ShadowRoot[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)
  let node: Node | null = walker.currentNode
  while (node) {
    if (node instanceof Element && node.shadowRoot) shadows.push(node.shadowRoot)
    node = walker.nextNode()
  }
  return shadows
}
