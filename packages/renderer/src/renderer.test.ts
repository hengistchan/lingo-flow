import type { BlockBinding, InsertionPlan, PageDisplayMode, TranslationBlock, TranslationInsertion } from '@lingoflow/types'
import {
  applyDisplayMode,
  hideSourceNodes,
  restoreSourceNodes,
} from './display-mode'
import { clearTranslations, injectLingoFlowStyles, renderBelowOriginal, safeRender } from './index'
import { StrategyRegistry } from './registry'
import {
  AfterBlockStrategy,
  BeforeNestedStructureStrategy,
  type InsertionStrategy,
  InlineInsideStrategy,
  InsideContainerStrategy,
  LinebreakInsideStrategy,
} from './strategies'

describe('renderer', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
  })

  it('renders translated text below original without injecting provider HTML', () => {
    document.body.innerHTML = '<p data-lingoflow-block-id="block_1">Original paragraph.</p>'

    renderBelowOriginal({
      blockId: 'block_1',
      translatedText: '<strong>中文译文</strong>',
    })

    const translation = document.querySelector('[data-lingoflow-translation="block_1"]') as HTMLElement
    expect(translation).not.toBeNull()
    expect(translation.textContent).toBe('<strong>中文译文</strong>')
    expect(translation.querySelector('strong')).toBeNull()
  })

  it('renders linebreak-inside translations inside paragraphs', () => {
    document.body.innerHTML = '<p data-lingoflow-block-id="block_para">Original paragraph.</p>'

    renderBelowOriginal({
      blockId: 'block_para',
      translatedText: '段落译文',
      insertion: 'linebreak-inside',
    })

    const paragraph = document.querySelector('p') as HTMLElement
    const translation = document.querySelector('[data-lingoflow-translation="block_para"]') as HTMLElement
    expect(translation.parentElement).toBe(paragraph)
    expect(translation.tagName.toLowerCase()).toBe('span')
    expect(translation.classList.contains('notranslate')).toBe(true)
    expect(translation.previousSibling?.nodeName).toBe('BR')
  })

  it('renders inline-inside translations inside compact headings', () => {
    document.body.innerHTML = '<h2 data-lingoflow-block-id="block_heading">What</h2>'

    renderBelowOriginal({
      blockId: 'block_heading',
      translatedText: '什么',
      insertion: 'inline-inside',
    })

    const heading = document.querySelector('h2') as HTMLElement
    const translation = document.querySelector('[data-lingoflow-translation="block_heading"]') as HTMLElement
    expect(translation.parentElement).toBe(heading)
    expect(translation.tagName.toLowerCase()).toBe('span')
    expect(translation.previousSibling?.textContent).toBe('  ')
  })

  it('keeps primary title link translations inside the source anchor', () => {
    document.body.innerHTML = `
      <h3>
        <a data-lingoflow-block-id="block_link" href="/repo/pull/208">
          docs(readme): align the homepage status banner
          <span>#208</span>
        </a>
      </h3>
    `

    renderBelowOriginal({
      blockId: 'block_link',
      translatedText: '文档（自述文件）：将首页状态横幅对齐 #208',
      insertion: 'linebreak-inside',
    })

    const anchor = document.querySelector('a') as HTMLElement
    const translation = document.querySelector('[data-lingoflow-translation="block_link"]') as HTMLElement
    expect(translation.parentElement).toBe(anchor)
    expect(anchor.nextElementSibling).toBeNull()
    expect(translation.previousSibling?.nodeName).toBe('BR')
  })

  it('renders list item translations inside the source list item', () => {
    document.body.innerHTML = `
      <ul>
        <li data-lingoflow-block-id="block_li">Original list item content that stays in the list.</li>
      </ul>
    `

    renderBelowOriginal({ blockId: 'block_li', translatedText: '列表项译文' })

    const translation = document.querySelector('[data-lingoflow-translation="block_li"]') as HTMLElement
    expect(translation.parentElement?.tagName.toLowerCase()).toBe('li')
    expect(document.querySelector('ul')?.children).toHaveLength(1)
  })

  it('places parent list item translations before nested child lists', () => {
    document.body.innerHTML = `
      <ul>
        <li data-lingoflow-block-id="block_parent">
          <p><strong>Discounts:</strong> Parent list item summary should be translated before nested items.</p>
          <ul>
            <li data-lingoflow-block-id="block_child">Nested child item should remain after the parent translation.</li>
          </ul>
        </li>
      </ul>
    `

    renderBelowOriginal({ blockId: 'block_parent', translatedText: '父级列表项译文' })

    const parent = document.querySelector('[data-lingoflow-block-id="block_parent"]') as HTMLElement
    const translation = document.querySelector('[data-lingoflow-translation="block_parent"]') as HTMLElement
    expect(translation.parentElement).toBe(parent)
    expect(translation.previousElementSibling?.tagName.toLowerCase()).toBe('p')
    expect(translation.nextElementSibling?.tagName.toLowerCase()).toBe('ul')
  })

  it('renders table cell translations inside the source cell', () => {
    document.body.innerHTML = `
      <table>
        <tbody>
          <tr>
            <td data-lingoflow-block-id="block_cell">Original table cell content that stays in the cell.</td>
          </tr>
        </tbody>
      </table>
    `

    renderBelowOriginal({ blockId: 'block_cell', translatedText: '表格单元格译文' })

    const translation = document.querySelector('[data-lingoflow-translation="block_cell"]') as HTMLElement
    expect(translation.parentElement?.tagName.toLowerCase()).toBe('td')
    expect(document.querySelector('tr')?.children).toHaveLength(1)
  })

  it('promotes inline source nodes to the nearest block ancestor before inserting translation', () => {
    document.body.innerHTML = `
      <p>Read <span data-lingoflow-block-id="block_inline">this important inline phrase</span> before continuing.</p>
    `

    renderBelowOriginal({ blockId: 'block_inline', translatedText: '行内短语译文' })

    const translation = document.querySelector('[data-lingoflow-translation="block_inline"]') as HTMLElement
    expect(translation.parentElement).toBe(document.body)
    expect(translation.previousElementSibling?.tagName.toLowerCase()).toBe('p')
  })

  it('clears inserted translations and block ids without removing original content', () => {
    document.body.innerHTML = '<p data-lingoflow-block-id="block_1">Original paragraph.</p>'
    renderBelowOriginal({ blockId: 'block_1', translatedText: '中文译文' })

    clearTranslations()

    expect(document.querySelector('[data-lingoflow-translation]')).toBeNull()
    expect(document.querySelector('p')?.textContent).toBe('Original paragraph.')
    expect(document.querySelector('p')?.getAttribute('data-lingoflow-block-id')).toBeNull()
  })

  it('clears linebreak-inside wrappers and generated breaks', () => {
    document.body.innerHTML = '<p data-lingoflow-block-id="block_1">Original paragraph.</p>'
    renderBelowOriginal({ blockId: 'block_1', translatedText: '中文译文', insertion: 'linebreak-inside' })

    clearTranslations()

    expect(document.querySelector('[data-lingoflow-translation]')).toBeNull()
    expect(document.querySelector('[data-lingoflow-translation-break]')).toBeNull()
    expect(document.querySelector('p')?.innerHTML).toBe('Original paragraph.')
  })

  it('injects styles once and safeRender skips missing nodes', () => {
    injectLingoFlowStyles()
    injectLingoFlowStyles()
    safeRender({ blockId: 'missing', translatedText: '不会抛出' })

    expect(document.querySelectorAll('#lingoflow-style')).toHaveLength(1)
  })
})

describe('renderer insertion strategies', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
  })

  it('registers built-in strategies in priority order', () => {
    const registry = StrategyRegistry.withBuiltIns()

    expect(registry.names()).toEqual([
      'linebreak-inside',
      'inline-inside',
      'inside-container',
      'before-nested-structure',
      'after-block',
    ])
  })

  it('linebreak-inside inserts a generated break and inline wrapper inside the carrier', () => {
    document.body.innerHTML = '<p>Original paragraph.</p>'
    const carrier = document.querySelector('p') as HTMLElement
    const translation = createTranslationElement('block_linebreak', '段落译文')

    const result = new LinebreakInsideStrategy().apply(createPlan({
      blockId: 'block_linebreak',
      target: carrier,
      translationElement: translation,
      placement: 'linebreak-inside',
    }))

    expect(result.insertedNodes).toEqual([expect.any(HTMLBRElement), translation])
    expect(carrier.lastElementChild).toBe(translation)
    expect(translation.tagName.toLowerCase()).toBe('span')
    expect(translation.classList.contains('lingoflow-translation-inline')).toBe(true)
    expect(translation.textContent).toBe('段落译文')
    expectGeneratedNodes(result, 'block_linebreak')
  })

  it('inline-inside inserts a generated spacer and inline wrapper inside the carrier', () => {
    document.body.innerHTML = '<h2>What</h2>'
    const heading = document.querySelector('h2') as HTMLElement
    const translation = createTranslationElement('block_inline', '什么')

    const result = new InlineInsideStrategy().apply(createPlan({
      blockId: 'block_inline',
      target: heading,
      translationElement: translation,
      placement: 'inline-inside',
    }))

    const [spacer] = result.insertedNodes
    expect(spacer.textContent).toBe('  ')
    expect(heading.lastElementChild).toBe(translation)
    expect(translation.tagName.toLowerCase()).toBe('span')
    expect(translation.classList.contains('lingoflow-translation-inline')).toBe(true)
    expectGeneratedNodes(result, 'block_inline')
  })

  it.each([
    ['li', '<ul><li>Original list item.</li></ul>'],
    ['td', '<table><tbody><tr><td>Original cell.</td></tr></tbody></table>'],
    ['th', '<table><tbody><tr><th>Original header.</th></tr></tbody></table>'],
    ['figcaption', '<figure><figcaption>Original caption.</figcaption></figure>'],
  ])('inside-container appends inside %s carriers', (tagName, html) => {
    document.body.innerHTML = html
    const carrier = document.querySelector(tagName) as HTMLElement
    const translation = createTranslationElement(`block_${tagName}`, '容器译文', 'div')

    const result = new InsideContainerStrategy().apply(createPlan({
      blockId: `block_${tagName}`,
      target: carrier,
      translationElement: translation,
      placement: 'inside-container',
    }))

    expect(translation.parentElement).toBe(carrier)
    expect(carrier.lastElementChild).toBe(translation)
    expectGeneratedNodes(result, `block_${tagName}`)
  })

  it.each(['ul', 'ol'])('before-nested-structure inserts before nested %s elements', nestedTag => {
    document.body.innerHTML = `
      <ul>
        <li>
          <p>Parent summary.</p>
          <${nestedTag}><li>Nested item.</li></${nestedTag}>
        </li>
      </ul>
    `
    const carrier = document.querySelector('li') as HTMLElement
    const nested = carrier.querySelector(nestedTag) as HTMLElement
    const translation = createTranslationElement(`block_nested_${nestedTag}`, '父级译文', 'div')

    const result = new BeforeNestedStructureStrategy().apply(createPlan({
      blockId: `block_nested_${nestedTag}`,
      target: carrier,
      translationElement: translation,
      placement: 'before-nested-structure',
    }))

    expect(translation.parentElement).toBe(carrier)
    expect(translation.nextElementSibling).toBe(nested)
    expectGeneratedNodes(result, `block_nested_${nestedTag}`)
  })

  it('after-block inserts after the safe block ancestor', () => {
    document.body.innerHTML = '<p>Read <span>this phrase</span> before continuing.</p>'
    const inlineSource = document.querySelector('span') as HTMLElement
    const paragraph = document.querySelector('p') as HTMLElement
    const translation = createTranslationElement('block_after', '行内短语译文', 'div')

    const result = new AfterBlockStrategy().apply(createPlan({
      blockId: 'block_after',
      target: inlineSource,
      translationElement: translation,
      placement: 'after-block',
    }))

    expect(translation.parentElement).toBe(document.body)
    expect(translation.previousElementSibling).toBe(paragraph)
    expectGeneratedNodes(result, 'block_after')
  })

  it('strategy revert removes inserted nodes and restores hidden source nodes', () => {
    document.body.innerHTML = '<p>Original paragraph.</p>'
    const source = document.querySelector('p') as HTMLElement
    const translation = createTranslationElement('block_revert', '译文', 'div')
    const strategy = new AfterBlockStrategy()
    const result = strategy.apply(createPlan({
      blockId: 'block_revert',
      mode: 'translation',
      target: source,
      translationElement: translation,
      placement: 'after-block',
      sourceNodesToHide: [source],
    }))

    expect(source.hidden).toBe(true)

    strategy.revert(result)

    expect(document.querySelector('[data-lingoflow-translation="block_revert"]')).toBeNull()
    expect(source.hidden).toBe(false)
    expect(source.dataset.lingoflowSourceHidden).toBeUndefined()
  })

  it.each([
    createStrategyFixture('linebreak-inside', () => '<p>Original paragraph text.</p>', 'p', new LinebreakInsideStrategy()),
    createStrategyFixture('inline-inside', () => '<h2>Original heading</h2>', 'h2', new InlineInsideStrategy()),
    createStrategyFixture('inside-container', () => '<ul><li>Original list item.</li></ul>', 'li', new InsideContainerStrategy()),
    createStrategyFixture(
      'before-nested-structure',
      () => '<ul><li>Parent item.<ul><li>Nested item.</li></ul></li></ul>',
      'li',
      new BeforeNestedStructureStrategy(),
    ),
    createStrategyFixture('after-block', () => '<p>Read <span>this phrase</span> before continuing.</p>', 'span', new AfterBlockStrategy()),
  ])('$name plans, applies, and reverts from real bindings', ({ name, html, selector, strategy }) => {
    document.body.innerHTML = html()
    const carrier = document.querySelector(selector) as HTMLElement
    const block = createBlock(name)
    const binding = createBinding(block, carrier)

    const plan = strategy.plan(block, binding, 'dual')
    expect(plan.blockId).toBe(block.id)
    expect(plan.mode).toBe('dual')
    expect(plan.placement).toBe(name)
    expect(plan.target).toBe(carrier)
    expect(plan.translationElement.textContent).toBe('译文')
    expect(plan.sourceNodesToHide).toEqual([carrier])

    const result = strategy.apply(plan)
    expect(result.blockId).toBe(block.id)
    expect(result.insertedNodes.length).toBeGreaterThan(0)
    expectGeneratedNodes(result, block.id)
    expect(document.querySelector(`[data-lingoflow-translation="${block.id}"]`)).not.toBeNull()

    strategy.revert(result)

    expect(document.querySelector(`[data-lingoflow-translation="${block.id}"]`)).toBeNull()
    expect(document.querySelector('[data-lingoflow-generated]')).toBeNull()
    expect(carrier.hidden).toBe(false)
    expect(carrier.dataset.lingoflowSourceHidden).toBeUndefined()
  })

  it.each([
    createStrategyFixture('linebreak-inside', () => '<p>Original paragraph text.</p>', 'p', new LinebreakInsideStrategy()),
    createStrategyFixture('inline-inside', () => '<h2>Original heading</h2>', 'h2', new InlineInsideStrategy()),
    createStrategyFixture('inside-container', () => '<table><tbody><tr><td>Original cell.</td></tr></tbody></table>', 'td', new InsideContainerStrategy()),
    createStrategyFixture(
      'before-nested-structure',
      () => '<ul><li>Parent item.<ol><li>Nested item.</li></ol></li></ul>',
      'li',
      new BeforeNestedStructureStrategy(),
    ),
    createStrategyFixture('after-block', () => '<p>Read <span>this phrase</span> before continuing.</p>', 'span', new AfterBlockStrategy()),
  ].flatMap(fixture => (
    ([
      ['original', false, true, false],
      ['dual', false, false, false],
      ['translation', true, false, true],
    ] satisfies Array<[PageDisplayMode, boolean, boolean, boolean]>)
      .map(([mode, sourceHidden, insertedHidden, resultHasHiddenSource]) => ({
        ...fixture,
        mode,
        sourceHidden,
        insertedHidden,
        resultHasHiddenSource,
      }))
  )))('$name supports $mode display mode through plan/apply/revert', ({
    name,
    html,
    selector,
    strategy,
    mode,
    sourceHidden,
    insertedHidden,
    resultHasHiddenSource,
  }) => {
    document.body.innerHTML = html()
    const carrier = document.querySelector(selector) as HTMLElement
    const block = createBlock(name)
    const binding = createBinding(block, carrier)

    const result = strategy.apply(strategy.plan(block, binding, mode))

    expect(carrier.hidden).toBe(sourceHidden)
    expect(carrier.dataset.lingoflowSourceHidden).toBe(sourceHidden ? 'true' : undefined)
    expect(result.hiddenSourceNodes).toEqual(resultHasHiddenSource ? [carrier] : [])
    for (const node of result.insertedNodes) {
      expect(node).toBeInstanceOf(HTMLElement)
      expect((node as HTMLElement).hidden).toBe(insertedHidden)
    }

    strategy.revert(result)

    expect(document.querySelector(`[data-lingoflow-translation="${block.id}"]`)).toBeNull()
    expect(document.querySelector('[data-lingoflow-generated]')).toBeNull()
    expect(carrier.hidden).toBe(false)
    expect(carrier.dataset.lingoflowSourceHidden).toBeUndefined()
  })
})

describe('renderer display modes', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
  })

  it('hides and restores source nodes in translation mode without removing them', () => {
    document.body.innerHTML = '<p data-lingoflow-block-id="block_1">Original source text.</p>'
    const source = document.querySelector('p') as HTMLElement

    const hidden = hideSourceNodes([source])
    expect(source.dataset.lingoflowSourceHidden).toBe('true')
    expect(source.hidden).toBe(true)

    restoreSourceNodes(hidden)
    expect(source.hidden).toBe(false)
    expect(source.dataset.lingoflowSourceHidden).toBeUndefined()
  })

  it.each([
    ['original', false, true],
    ['dual', false, false],
    ['translation', true, false],
  ] satisfies Array<[PageDisplayMode, boolean, boolean]>)(
    'applies %s display mode without provider work',
    (mode, sourceHidden, translationHidden) => {
      document.body.innerHTML = `
        <p data-lingoflow-block-id="block_mode">Original source text.</p>
        <div data-lingoflow-translation="block_mode">译文</div>
      `
      const source = document.querySelector('p') as HTMLElement
      const translation = document.querySelector('[data-lingoflow-translation]') as HTMLElement

      const result = applyDisplayMode({
        mode,
        sourceNodes: [source],
        insertedNodes: [translation],
      })

      expect(source.hidden).toBe(sourceHidden)
      expect(translation.hidden).toBe(translationHidden)
      expect(result.hiddenSourceNodes).toEqual(sourceHidden ? [source] : [])
    },
  )
})

function createPlan(overrides: {
  blockId: string
  mode?: PageDisplayMode
  target: HTMLElement
  translationElement: HTMLElement
  placement: TranslationInsertion
  sourceNodesToHide?: HTMLElement[]
}): InsertionPlan {
  return {
    mode: overrides.mode ?? 'dual',
    sourceNodesToHide: overrides.sourceNodesToHide ?? [],
    ...overrides,
  }
}

function createTranslationElement(blockId: string, text: string, tagName = 'span') {
  const translation = document.createElement(tagName)
  translation.dataset.lingoflowTranslation = blockId
  translation.textContent = text
  return translation
}

function expectGeneratedNodes(result: { insertedNodes: Node[] }, blockId: string) {
  for (const node of result.insertedNodes) {
    expect(node).toBeInstanceOf(HTMLElement)
    const element = node as HTMLElement
    expect(element.classList.contains('notranslate')).toBe(true)
    expect(element.dataset.lingoflowGenerated).toBe('true')
    expect(
      element.dataset.lingoflowTranslation ??
        element.dataset.lingoflowTranslationBreak ??
        element.dataset.lingoflowTranslationSpacer
    ).toBe(blockId)
  }
}

function createStrategyFixture(
  name: TranslationInsertion,
  html: () => string,
  selector: string,
  strategy: InsertionStrategy,
) {
  return { name, html, selector, strategy }
}

function createBlock(insertion: TranslationInsertion): TranslationBlock {
  return {
    id: `block_${insertion.replaceAll('-', '_')}`,
    revision: 1,
    runId: 'run_1',
    text: 'Original text',
    normalizedText: 'Original text',
    textHash: 'hash_1',
    requestText: 'Original text',
    inlineTokens: [],
    translatedText: '译文',
    state: 'translated',
    meta: {
      tagName: 'p',
      carrierTagName: 'p',
      blockType: 'paragraph',
      insertion,
      depth: 1,
      visible: true,
      textLength: 13,
      rootKind: 'html',
    },
    sourceLang: 'auto',
    targetLang: 'zh-Hans',
    pageUrl: 'https://example.com/article',
    domain: 'example.com',
  }
}

function createBinding(block: TranslationBlock, carrierElement: HTMLElement): BlockBinding {
  return {
    blockId: block.id,
    revision: block.revision,
    runId: block.runId,
    carrierElement,
    sourceNodes: [carrierElement.firstChild ?? carrierElement],
    commonAncestor: carrierElement,
    insertedNodes: [],
    hiddenSourceNodes: [],
    loadingElement: null,
    sourceSignature: 'signature_1',
    collectedAtMutationSeq: 1,
    rootGeneration: 1,
  }
}
