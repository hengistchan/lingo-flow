import { sha256 } from '@lingoflow/shared'
import type {
  BlockBindingDraft,
  CollectionDiagnostics,
  CollectionSkipReason,
  ContentRootKind,
  InlineToken,
  RuntimeContext,
  TextBlock,
  TextBlockType,
  TranslationBlock,
  TranslationInsertion,
} from '@lingoflow/types'
import { CollectScanResultsOutput, ScanResult } from '@lingoflow/types'
import { discoverContentRoots } from './content-root'
import { extractInlineText } from './inline-tokenization'
import { findAllShadowRoots } from './page-adapters'
import {
  IGNORE_SELECTORS,
  isGeneratedByLingoFlow,
  isInsideUIExclusion,
  isTranslatableElement,
  isTranslatableTableCell,
  hasTooManyInteractiveElements,
  hasBlockLevelChildren,
  isVisible,
} from './filters'

export const BLOCK_SELECTORS = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'div',
  'li',
  'blockquote',
  'td',
  'th',
  'dd',
  'figcaption',
]

export type CollectTextBlockOptions = {
  sourceLang: 'auto' | string
  targetLang: string
  pageUrl: string
  domain: string
}

export type CollectScanResultOptions = CollectTextBlockOptions & {
  runId: string
  rootGeneration: number
  dryRun?: boolean
}

export type RuntimeCollectionContext = RuntimeContext & {
  dryRun?: boolean
}

type CollectionConfig = {
  sourceLang: 'auto' | string
  targetLang: string
  pageUrl: string
  domain: string
  runId: string
  rootGeneration: number
  ruleId: string
  contentRootSelectors: string[]
  blockSelectors: string[]
  excludeSelectors: string[]
  defaultInsertion: TranslationInsertion
  minTextLength: number
  maxInteractiveElements: number
  minRootTextLength: number
  minRootParagraphCount: number
  linkDensityPenalty: number
  dryRun: boolean
}

export async function collectScanResults(
  root: Document | HTMLElement,
  options: CollectScanResultOptions | RuntimeCollectionContext,
): Promise<CollectScanResultsOutput> {
  const config = resolveCollectionConfig(options)
  const rootDiscovery = discoverContentRoots(root, {
    contentRootSelectors: config.contentRootSelectors,
    excludeSelectors: config.excludeSelectors,
    minRootTextLength: config.minRootTextLength,
    minRootParagraphCount: config.minRootParagraphCount,
    linkDensityPenalty: config.linkDensityPenalty,
  })
  const contentRoots = rootDiscovery.roots
  let candidates = uniqueElements(
    contentRoots.flatMap(contentRoot =>
      queryCandidateElements(contentRoot, config.blockSelectors.join(','))
        .filter((element): element is HTMLElement => element instanceof HTMLElement)
    )
  )

  const shadowRoots = contentRoots.flatMap(r => findAllShadowRoots(r))
  for (const shadowRoot of shadowRoots) {
    const shadowCandidates = Array.from(shadowRoot.querySelectorAll(config.blockSelectors.join(',')))
      .filter((element): element is HTMLElement => element instanceof HTMLElement)
    candidates.push(...shadowCandidates)
  }
  candidates = uniqueElements(candidates)

  const results: ScanResult[] = []
  const acceptedElements: HTMLElement[] = []
  const skipReasons: Partial<Record<CollectionSkipReason, number>> = {}
  const textHashOccurrences = new Map<string, number>()

  for (const element of candidates) {
    if (isInsideAcceptedStructuralBoundary(element, acceptedElements)) {
      incrementSkipReason(skipReasons, 'structural-parent-accepted')
      continue
    }
    if (isGeneratedByLingoFlow(element)) {
      incrementSkipReason(skipReasons, 'generated-node')
      continue
    }
    if (matchesSelfOrClosest(element, config.excludeSelectors)) {
      incrementSkipReason(skipReasons, 'inside-ignore-selector')
      continue
    }
    if (element.tagName.toLowerCase() === 'div' && hasBlockLevelChildren(element)) {
      incrementSkipReason(skipReasons, 'block-level-children')
      continue
    }
    if (isInsideUIExclusion(element)) {
      incrementSkipReason(skipReasons, 'inside-ui-exclusion')
      continue
    }
    if (!isTranslatableTableCell(element, config.maxInteractiveElements)) {
      incrementSkipReason(skipReasons, 'table-cell-too-interactive')
      continue
    }
    if (hasTooManyInteractiveElements(element, config.maxInteractiveElements)) {
      incrementSkipReason(skipReasons, 'too-many-interactive-elements')
      continue
    }

    if (!isVisible(element)) {
      incrementSkipReason(skipReasons, 'not-visible')
      continue
    }
    if (element.closest(IGNORE_SELECTORS.join(','))) {
      incrementSkipReason(skipReasons, 'inside-ignore-selector')
      continue
    }
    if (element.dataset.lingoflowBlockId) {
      incrementSkipReason(skipReasons, 'already-bound')
      continue
    }

    const text = getElementPlainText(element)
    const blockType = detectBlockType(element)
    const minTextLength = config.minTextLength
    if (!meetsTextThreshold(element, text, blockType, minTextLength)) {
      incrementSkipReason(skipReasons, 'too-short')
      continue
    }

    const carrier = resolveTextCarrier(element)
    const inlineText = extractInlineText(carrier)
    const normalizedText = inlineText.text
    const textHash = await sha256(normalizedText)
    const occurrenceIndex = textHashOccurrences.get(textHash) ?? 0
    textHashOccurrences.set(textHash, occurrenceIndex + 1)
    const id = `block_${textHash.slice(0, 12)}_${occurrenceIndex}`
    const rootKind = resolveRootKind(element, contentRoots, shadowRoots)

    if (!config.dryRun) {
      carrier.dataset.lingoflowBlockId = id
    }
    acceptedElements.push(carrier)

    const block: TranslationBlock = {
      id,
      revision: 1,
      runId: config.runId,
      text: inlineText.text,
      normalizedText,
      textHash,
      requestText: inlineText.requestText,
      inlineTokens: inlineText.inlineTokens,
      state: 'pending',
      meta: {
        tagName: carrier.tagName.toLowerCase(),
        depth: getElementDepth(carrier),
        visible: isVisible(carrier),
        textLength: normalizedText.length,
        blockType,
        insertion: resolveInsertion(element, carrier, blockType, normalizedText, config.defaultInsertion),
        carrierTagName: carrier.tagName.toLowerCase(),
        rootKind,
        ruleId: config.ruleId,
        rootGeneration: config.rootGeneration,
      },
      sourceLang: config.sourceLang,
      targetLang: config.targetLang,
      pageUrl: config.pageUrl,
      domain: config.domain,
    }

    const binding: BlockBindingDraft = {
      blockId: id,
      carrierElement: carrier,
      sourceNodes: [carrier],
      commonAncestor: carrier,
      sourceSignature: buildSourceSignature(carrier),
    }

    results.push({ block, binding })
  }

  const diagnostics: CollectionDiagnostics = {
    rootsConsidered: rootDiscovery.diagnostics.considered.length,
    rootsSelected: rootDiscovery.diagnostics.selected.length,
    rejectedRoots: rootDiscovery.diagnostics.rejected.length,
    candidateCount: candidates.length,
    acceptedBlockCount: results.length,
    skippedCandidateCount: candidates.length - results.length,
    skipReasons,
    selectedRoots: rootDiscovery.diagnostics.selected,
    rejectedRootDetails: rootDiscovery.diagnostics.rejected,
  }

  return { blocks: results, diagnostics }
}

export async function collectTextBlocks(root: Document, options: CollectTextBlockOptions): Promise<TextBlock[]> {
  const output = await collectScanResults(root, {
    ...options,
    runId: 'legacy-run',
    rootGeneration: 1,
  })
  return output.blocks.map(result => toLegacyTextBlock(result.block))
}

function incrementSkipReason(skipReasons: Partial<Record<CollectionSkipReason, number>>, reason: CollectionSkipReason): void {
  skipReasons[reason] = (skipReasons[reason] ?? 0) + 1
}

function meetsTextThreshold(element: HTMLElement, text: string, blockType: TextBlockType, minTextLength: number): boolean {
  if (blockType === 'heading') return text.length > 0
  if (blockType === 'table') return text.length >= minTextLength
  if (blockType === 'caption' || blockType === 'description') return text.length > 0
  if (text.length < minTextLength) return false

  if (blockType !== 'list' && element.children.length > 0) {
    const childTextLength = Array.from(element.children)
      .map(child => ((child as HTMLElement).innerText || child.textContent || '').trim().length)
      .reduce((sum, length) => sum + length, 0)
    if (childTextLength > text.length * 0.8) return false
  }

  return true
}

function getElementPlainText(element: HTMLElement): string {
  return (element.innerText || element.textContent || '').trim()
}

function toLegacyTextBlock(block: TranslationBlock): TextBlock {
  return {
    id: block.id,
    elementRefId: block.id,
    text: block.text,
    requestText: block.requestText,
    normalizedText: block.normalizedText,
    textHash: block.textHash,
    inlineTokens: block.inlineTokens,
    sourceLang: block.sourceLang,
    targetLang: block.targetLang,
    pageUrl: block.pageUrl,
    domain: block.domain,
    meta: {
      tagName: block.meta.tagName,
      depth: block.meta.depth,
      visible: block.meta.visible,
      textLength: block.meta.textLength,
      blockType: block.meta.blockType,
      insertion: block.meta.insertion,
      carrierTagName: block.meta.carrierTagName,
    },
  }
}

function uniqueElements(elements: HTMLElement[]): HTMLElement[] {
  return [...new Set(elements)]
}

function resolveCollectionConfig(options: CollectScanResultOptions | RuntimeCollectionContext): CollectionConfig {
  if (isRuntimeContext(options)) {
    return {
      sourceLang: options.sourceLang,
      targetLang: options.targetLang,
      pageUrl: options.url,
      domain: options.domain,
      runId: options.runId,
      rootGeneration: options.rootGeneration,
      ruleId: options.pageRule.id,
      contentRootSelectors: options.pageRule.selectors.contentRoots,
      blockSelectors: options.pageRule.selectors.blockSelectors,
      excludeSelectors: options.pageRule.selectors.excludeSelectors,
      defaultInsertion: options.pageRule.behavior.defaultInsertion,
      minTextLength: options.pageRule.thresholds.minTextLength,
      maxInteractiveElements: options.pageRule.thresholds.maxInteractiveElements,
      minRootTextLength: options.pageRule.thresholds.minRootTextLength,
      minRootParagraphCount: options.pageRule.thresholds.minRootParagraphCount,
      linkDensityPenalty: options.pageRule.thresholds.linkDensityPenalty,
      dryRun: options.dryRun ?? false,
    }
  }

  return {
    sourceLang: options.sourceLang,
    targetLang: options.targetLang,
    pageUrl: options.pageUrl,
    domain: options.domain,
    runId: options.runId,
    rootGeneration: options.rootGeneration,
    ruleId: 'legacy-default',
    contentRootSelectors: [],
    blockSelectors: BLOCK_SELECTORS,
    excludeSelectors: IGNORE_SELECTORS,
    defaultInsertion: 'after-block',
    minTextLength: 20,
    maxInteractiveElements: 5,
    minRootTextLength: 80,
    minRootParagraphCount: 1,
    linkDensityPenalty: 400,
    dryRun: options.dryRun ?? false,
  }
}

function isRuntimeContext(options: CollectScanResultOptions | RuntimeCollectionContext): options is RuntimeCollectionContext {
  return 'pageRule' in options
}

function queryCandidateElements(root: HTMLElement, selector: string): Element[] {
  const elements = Array.from(root.querySelectorAll(selector))
  if (root.matches(selector)) {
    elements.unshift(root)
  }
  return elements
}

function matchesSelfOrClosest(element: HTMLElement, selectors: string[]): boolean {
  const selector = selectors.join(',')
  if (!selector) return false
  return element.matches(selector) || !!element.closest(selector)
}

function resolveRootKind(
  element: HTMLElement,
  contentRoots: HTMLElement[],
  shadowRoots: ShadowRoot[],
): ContentRootKind {
  for (const shadow of shadowRoots) {
    if (shadow.contains(element)) return 'shadow'
  }
  for (const root of contentRoots) {
    if (root.contains(element)) return 'html'
  }
  return 'html'
}

function buildSourceSignature(carrier: HTMLElement): string {
  const tagName = carrier.tagName.toLowerCase()
  const depth = getElementDepth(carrier)
  const text = (carrier.textContent || '').slice(0, 80)
  return `${tagName}:${depth}:${text}`
}

function isInsideAcceptedStructuralBoundary(element: HTMLElement, acceptedElements: HTMLElement[]): boolean {
  return acceptedElements.some(accepted => {
    if (accepted === element || !accepted.contains(element)) return false
    const acceptedTagName = accepted.tagName.toLowerCase()
    if (acceptedTagName === 'td' || acceptedTagName === 'th') return true
    if (acceptedTagName === 'li') return isSameListItemParagraphWrapper(element, accepted)
    return false
  })
}

function isSameListItemParagraphWrapper(element: HTMLElement, listItem: HTMLElement): boolean {
  return element.tagName.toLowerCase() === 'p' && element.closest('li') === listItem
}

function resolveTextCarrier(element: HTMLElement): HTMLElement {
  const primaryAnchor = findPrimaryTextAnchor(element)
  return primaryAnchor ?? element
}

function findPrimaryTextAnchor(element: HTMLElement): HTMLElement | null {
  const tagName = element.tagName.toLowerCase()
  if (!/^h[1-6]$/.test(tagName)) return null

  const text = (element.innerText || element.textContent || '').trim()
  if (text.length < 20) return null

  const anchors = Array.from(element.querySelectorAll('a'))
    .filter(node => ((node as HTMLElement).innerText || node.textContent || '').trim().length >= 20)

  if (anchors.length !== 1) return null

  const anchor = anchors[0] as HTMLElement
  const anchorText = (anchor.innerText || anchor.textContent || '').trim()
  if (anchorText.length / text.length < 0.8) return null

  return anchor
}

function resolveInsertion(
  source: HTMLElement,
  carrier: HTMLElement,
  blockType: TextBlockType,
  text: string,
  defaultInsertion: TranslationInsertion = 'after-block',
): TranslationInsertion {
  const carrierTagName = carrier.tagName.toLowerCase()
  if (carrierTagName === 'a') return 'linebreak-inside'
  if (blockType === 'table') return 'inside-container'
  if (blockType === 'list') return hasNestedList(source) ? 'before-nested-structure' : 'inside-container'
  if (blockType === 'heading') return text.length <= 32 ? 'inline-inside' : 'linebreak-inside'
  if (blockType === 'paragraph' || blockType === 'quote') return 'linebreak-inside'
  if (blockType === 'caption' || blockType === 'description') return 'linebreak-inside'
  return defaultInsertion
}

function hasNestedList(element: HTMLElement): boolean {
  return Array.from(element.children).some(child => {
    const tagName = child.tagName.toLowerCase()
    return tagName === 'ul' || tagName === 'ol'
  })
}

function getElementDepth(element: HTMLElement): number {
  let depth = 0
  let current: HTMLElement | null = element

  while (current.parentElement) {
    depth += 1
    current = current.parentElement
  }

  return depth
}

export function detectBlockType(element: HTMLElement): TextBlockType {
  const tagName = element.tagName.toLowerCase()

  if (/^h[1-6]$/.test(tagName)) return 'heading'
  if (tagName === 'p' || tagName === 'div') return 'paragraph'
  if (tagName === 'li') return 'list'
  if (tagName === 'blockquote') return 'quote'
  if (tagName === 'td' || tagName === 'th') return 'table'
  if (tagName === 'figcaption') return 'caption'
  if (tagName === 'dd') return 'description'
  return 'unknown'
}

export { isTranslatableElement, isVisible } from './filters'
export { discoverContentRoots } from './content-root'
