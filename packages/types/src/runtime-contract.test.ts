import type { BlockBinding, BlockBindingDraft, TranslationBlock } from './index'

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
