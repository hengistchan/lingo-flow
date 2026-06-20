import { collectTextBlocks, type CollectTextBlockOptions } from '@lingoflow/dom'
import { renderBelowOriginal } from '@lingoflow/renderer'
import { normalizeText, restoreInlineTokens } from '@lingoflow/shared'
import type { InlineToken, TextBlock, TextBlockType, TranslationInsertion } from '@lingoflow/types'

export type TranslationInspectionOptions = Partial<CollectTextBlockOptions> & {
  translate?: (block: TextBlock, index: number) => string
  maxTextLength?: number
}

export type TranslationInspectionBlock = {
  order: number
  blockId: string
  path: string
  tagName: string
  blockType: TextBlockType
  insertion: TranslationInsertion
  sourceText: string
  requestText: string
  translatedText: string
  inlineTokens: InlineToken[]
}

export type SimplifiedDomNode = {
  tagName: string
  attrs?: Record<string, string>
  text?: string
  children?: SimplifiedDomNode[]
}

export type TranslationInspectionReport = {
  blocks: TranslationInspectionBlock[]
  tree: SimplifiedDomNode
}

export async function inspectDomTranslation(
  input: string | Document,
  options: TranslationInspectionOptions = {},
): Promise<TranslationInspectionReport> {
  const root = typeof input === 'string' ? createInspectionDocument(input) : input
  const maxTextLength = options.maxTextLength ?? 120
  const blocks = await collectTextBlocks(root, {
    sourceLang: options.sourceLang ?? 'auto',
    targetLang: options.targetLang ?? 'zh-Hans',
    pageUrl: options.pageUrl ?? 'https://example.test/inspection',
    domain: options.domain ?? 'example.test',
  })

  const inspectedBlocks = blocks.map((block, index): TranslationInspectionBlock => {
    const providerText = options.translate?.(block, index) ?? `译: ${block.requestText}`
    const translatedText = restoreInlineTokens(providerText, block.inlineTokens)

    renderBelowOriginal({
      blockId: block.id,
      translatedText,
      insertion: block.meta.insertion,
      targetLang: block.targetLang,
    }, root)

    return {
      order: index + 1,
      blockId: block.id,
      path: createElementPath(findBlockElement(root, block.id)),
      tagName: block.meta.tagName,
      blockType: block.meta.blockType,
      insertion: block.meta.insertion,
      sourceText: truncate(block.text, maxTextLength),
      requestText: truncate(block.requestText, maxTextLength),
      translatedText: truncate(translatedText, maxTextLength),
      inlineTokens: block.inlineTokens,
    }
  })

  return {
    blocks: inspectedBlocks,
    tree: simplifyDom(root.body ?? root.documentElement, maxTextLength),
  }
}

export function printTranslationInspection(report: TranslationInspectionReport): string {
  return [
    'Blocks',
    ...report.blocks.flatMap(block => [
      `${block.order}. ${block.tagName} ${block.insertion} ${block.path}`,
      `   source: ${block.sourceText}`,
      `   request: ${block.requestText}`,
      `   translated: ${block.translatedText}`,
      block.inlineTokens.length
        ? `   tokens: ${block.inlineTokens.map(token => `${token.id}=${token.text}`).join(', ')}`
        : '   tokens: none',
    ]),
    'DOM',
    formatSimplifiedDom(report.tree),
  ].join('\n')
}

function createInspectionDocument(html: string): Document {
  const root = document.implementation.createHTMLDocument('LingoFlow DOM inspection')
  root.body.innerHTML = html
  return root
}

function findBlockElement(root: Document, blockId: string): HTMLElement | null {
  const element = root.querySelector(`[data-lingoflow-block-id="${CSS.escape(blockId)}"]`)
  return element instanceof HTMLElement ? element : null
}

function createElementPath(element: HTMLElement | null): string {
  if (!element) return '<missing>'

  const parts: string[] = []
  let current: HTMLElement | null = element

  while (current && current.tagName.toLowerCase() !== 'body') {
    const tagName = current.tagName.toLowerCase()
    const siblings = current.parentElement
      ? Array.from(current.parentElement.children)
        .filter(child => child.tagName.toLowerCase() === tagName)
      : []
    const index = siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(current) + 1})` : ''
    parts.unshift(`${tagName}${index}`)
    current = current.parentElement
  }

  return parts.join(' > ')
}

function simplifyDom(element: Element, maxTextLength: number): SimplifiedDomNode {
  const node: SimplifiedDomNode = {
    tagName: element.tagName.toLowerCase(),
  }
  const attrs = collectUsefulAttributes(element)
  if (Object.keys(attrs).length > 0) node.attrs = attrs

  const children: SimplifiedDomNode[] = []
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = truncate(normalizeText(child.textContent ?? ''), maxTextLength)
      if (text) children.push({ tagName: '#text', text })
      continue
    }
    if (child instanceof Element) {
      children.push(simplifyDom(child, maxTextLength))
    }
  }

  if (children.length > 0) node.children = children
  return node
}

function collectUsefulAttributes(element: Element): Record<string, string> {
  const attrs: Record<string, string> = {}
  for (const attr of Array.from(element.attributes)) {
    if (
      attr.name === 'id' ||
      attr.name === 'href' ||
      attr.name === 'lang' ||
      attr.name === 'class' ||
      attr.name.startsWith('data-lingoflow-')
    ) {
      attrs[attr.name] = attr.value
    }
  }
  return attrs
}

function formatSimplifiedDom(node: SimplifiedDomNode, depth = 0): string {
  const indent = '  '.repeat(depth)
  if (node.tagName === '#text') return `${indent}"${node.text ?? ''}"`

  const attrs = node.attrs
    ? ' ' + Object.entries(node.attrs).map(([key, value]) => `${key}="${value}"`).join(' ')
    : ''
  const line = `${indent}<${node.tagName}${attrs}>`
  const children = node.children?.map(child => formatSimplifiedDom(child, depth + 1)) ?? []
  return [line, ...children].join('\n')
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`
}
