import type { BlockBinding, BlockBindingDraft, BlockEvent, PageAdapter, RuntimeEvent, TranslationBlock } from './index'

type DomReference = Node

type ContainsDomReference<T> = true extends ContainsDomReferenceMember<T, never> ? true : false

type ContainsDomReferenceMember<T, Seen> = [T] extends [Seen]
  ? false
  : T extends DomReference
    ? true
    : T extends (...args: infer Args) => infer Return
      ? ContainsDomReference<Args[number] | Return>
      : T extends readonly (infer Item)[]
        ? ContainsDomReferenceMember<Item, Seen | T>
        : T extends object
          ? true extends { [K in keyof T]-?: ContainsDomReferenceMember<T[K], Seen | T> }[keyof T]
            ? true
            : false
          : false

type ExpectTrue<T extends true> = T
type ExpectFalse<T extends false> = T

type RuntimeContractsStayDomFree = [
  ExpectFalse<ContainsDomReference<TranslationBlock>>,
  ExpectFalse<ContainsDomReference<BlockEvent>>,
  ExpectFalse<ContainsDomReference<RuntimeEvent>>,
]

type DomBearingContractsStayExplicit = [
  ExpectTrue<ContainsDomReference<BlockBindingDraft>>,
  ExpectTrue<ContainsDomReference<BlockBinding>>,
  ExpectTrue<ContainsDomReference<PageAdapter>>,
]

describe('translation runtime contracts', () => {
  it('keeps TranslationBlock serializable and DOM-free', () => {
    const block: TranslationBlock = {
      id: 'block_1',
      revision: 1,
      runId: 'run_1',
      text: 'Readable source text that should be translated.',
      normalizedText: 'Readable source text that should be translated.',
      textHash: 'hash_1',
      requestText: 'Readable source text that should be translated.',
      inlineTokens: [],
      state: 'pending',
      meta: {
        tagName: 'p',
        carrierTagName: 'p',
        blockType: 'paragraph',
        insertion: 'linebreak-inside',
        depth: 3,
        visible: true,
        textLength: 47,
        rootKind: 'html',
      },
      sourceLang: 'auto',
      targetLang: 'zh-Hans',
      pageUrl: 'https://example.com/article',
      domain: 'example.com',
    }

    expect(JSON.parse(JSON.stringify(block))).toMatchObject({
      id: 'block_1',
      state: 'pending',
    })
  })

  it('keeps RuntimeEvent serializable and DOM-free', () => {
    const event: RuntimeEvent = {
      type: 'observer:newContent',
      cause: 'child-list',
      rootKind: 'html',
      rootGeneration: 2,
      rootId: 'document:main',
    }

    expect(JSON.parse(JSON.stringify(event))).toEqual(event)
    expect('root' in event).toBe(false)
  })

  it('keeps DOM references in binding drafts', () => {
    const carrierElement = document.createElement('p')
    const draft: BlockBindingDraft = {
      blockId: 'block_1',
      carrierElement,
      sourceNodes: [carrierElement],
      commonAncestor: carrierElement,
      sourceSignature: 'p:0:Readable source text',
    }

    expect(draft.carrierElement).toBe(carrierElement)
  })

  it('keeps materialized DOM references in bindings', () => {
    const carrierElement = document.createElement('p')
    const translationElement = document.createElement('span')
    const binding: BlockBinding = {
      blockId: 'block_1',
      revision: 1,
      runId: 'run_1',
      carrierElement,
      sourceNodes: [carrierElement],
      commonAncestor: carrierElement,
      insertedNodes: [translationElement],
      hiddenSourceNodes: [carrierElement],
      loadingElement: null,
      sourceSignature: 'p:0:Readable source text',
      collectedAtMutationSeq: 2,
      rootGeneration: 1,
    }

    expect(binding.insertedNodes).toEqual([translationElement])
  })
})
