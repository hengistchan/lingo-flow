import { NORMALIZE_VERSION } from '@lingoflow/shared'
import type { MessageResponse, PublicRuntimeSettings, TranslationTask } from '@lingoflow/types'
import {
  HoverTranslationController,
  resolveTextAtPoint,
  segmentSentenceAtOffset,
} from './hover-translation'

describe('pointer sentence resolution', () => {
  beforeEach(resetDocument)

  it('segments the sentence containing the caret for English and Chinese punctuation', () => {
    const english = 'First sentence. The sentence under the pointer is here! Last sentence.'
    expect(segmentSentenceAtOffset(english, english.indexOf('pointer'))).toEqual({
      text: 'The sentence under the pointer is here!',
      start: 16,
      end: 55,
    })

    const chinese = '第一句。鼠标下面的句段需要单独翻译！最后一句。'
    expect(segmentSentenceAtOffset(chinese, chinese.indexOf('句段'))?.text)
      .toBe('鼠标下面的句段需要单独翻译！')
  })

  it('resolves the precise sentence and source offsets from a caret point', () => {
    document.body.innerHTML = '<p>Keep this sentence. Translate only this hovered sentence. Keep the last sentence.</p>'
    const textNode = document.querySelector('p')!.firstChild!
    const offset = textNode.textContent!.indexOf('hovered')
    Object.defineProperty(document, 'caretPositionFromPoint', {
      configurable: true,
      value: () => ({ offsetNode: textNode, offset }),
    })

    const hit = resolveTextAtPoint(document, 120, 80)

    expect(hit).toMatchObject({
      text: 'Translate only this hovered sentence.',
      start: 20,
      end: 57,
      source: 'caret',
      point: { x: 120, y: 80 },
    })
  })
})

describe('HoverTranslationController inline rendering', () => {
  beforeEach(resetDocument)

  it('translates only the pointed sentence and inserts it below the source block', async () => {
    document.body.innerHTML = '<article><p>Do not translate this. Translate the sentence under the mouse. Leave this alone.</p></article>'
    const paragraph = document.querySelector('p')!
    const textNode = paragraph.firstChild!
    const offset = textNode.textContent!.indexOf('under')
    Object.defineProperty(document, 'caretPositionFromPoint', {
      configurable: true,
      value: () => ({ offsetNode: textNode, offset }),
    })

    let translatedTask: TranslationTask | undefined
    const chromeRuntime = fakeRuntime(async message => {
      if (message.type === 'settings/getRuntime') return success(runtimeSettings())
      if (message.type === 'translation/translateBatch') {
        translatedTask = message.payload.tasks[0]
        return success({ results: [successResult(translatedTask!)] })
      }
      throw new Error(`Unexpected message: ${message.type}`)
    })
    const controller = new HoverTranslationController({ document, chromeRuntime })
    controller.start()
    document.dispatchEvent(new MouseEvent('pointermove', { clientX: 180, clientY: 120, bubbles: true }))

    const result = await controller.translateHoveredText()

    expect(result.status).toBe('success')
    expect(translatedTask?.sourceText).toBe('Translate the sentence under the mouse.')
    expect(paragraph.textContent).toBe(
      'Do not translate this. Translate the sentence under the mouse. Leave this alone.',
    )
    const group = document.querySelector('[data-lingoflow-partial-translation-group]') as HTMLElement
    const translation = document.querySelector('[data-lingoflow-partial-translation]') as HTMLElement
    expect(group.previousElementSibling).toBe(paragraph)
    expect(translation.textContent).toBe('译：Translate the sentence under the mouse.')
    expect(translation.dataset.lingoflowTranslation).toMatch(/^partial_source_1_/)
    expect(document.querySelector('[data-lingoflow-hover-card], [role="dialog"]')).toBeNull()
  })

  it('updates a repeated sentence translation instead of inserting a duplicate', async () => {
    document.body.innerHTML = '<p>Translate this sentence once.</p>'
    const textNode = document.querySelector('p')!.firstChild!
    Object.defineProperty(document, 'caretPositionFromPoint', {
      configurable: true,
      value: () => ({ offsetNode: textNode, offset: 8 }),
    })

    let providerCalls = 0
    const chromeRuntime = fakeRuntime(async message => {
      if (message.type === 'settings/getRuntime') return success(runtimeSettings())
      if (message.type === 'translation/translateBatch') {
        providerCalls += 1
        const task = message.payload.tasks[0] as TranslationTask
        return success({
          results: [{
            ...successResult(task),
            translatedText: `第 ${providerCalls} 次译文`,
          }],
        })
      }
      throw new Error(`Unexpected message: ${message.type}`)
    })
    const controller = new HoverTranslationController({ document, chromeRuntime })
    controller.start()
    document.dispatchEvent(new MouseEvent('pointermove', { clientX: 40, clientY: 20 }))

    await controller.translateHoveredText()
    await controller.translateHoveredText()

    const translations = document.querySelectorAll('[data-lingoflow-partial-translation]')
    expect(translations).toHaveLength(1)
    expect(translations[0].textContent).toBe('第 2 次译文')
  })

  it('degrades a cache read failure to a provider request', async () => {
    document.body.innerHTML = '<p>Translate this selected sentence despite a cache failure.</p>'
    const textNode = document.querySelector('p')!.firstChild!
    const range = document.createRange()
    range.selectNodeContents(textNode)
    const selection = document.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)

    let providerCalls = 0
    const chromeRuntime = fakeRuntime(async message => {
      if (message.type === 'settings/getRuntime') return success({ ...runtimeSettings(), cacheEnabled: true })
      if (message.type === 'translation-cache/resolve') {
        return { ok: false, error: { message: 'IndexedDB unavailable' } }
      }
      if (message.type === 'translation/translateBatch') {
        providerCalls += 1
        const task = message.payload.tasks[0] as TranslationTask
        return success({ results: [successResult(task)] })
      }
      throw new Error(`Unexpected message: ${message.type}`)
    })
    const controller = new HoverTranslationController({ document, chromeRuntime })

    const result = await controller.translateHoveredText()

    expect(result.status).toBe('success')
    expect(providerCalls).toBe(1)
    expect(document.querySelector('[data-lingoflow-partial-translation]')).not.toBeNull()
  })

  it('stays silent when there is no readable text and clears inline results on dismiss', async () => {
    const sendMessage = vi.fn(async () => success(runtimeSettings()))
    const controller = new HoverTranslationController({
      document,
      chromeRuntime: fakeRuntime(sendMessage),
    })

    expect(await controller.translateHoveredText()).toEqual({ status: 'no-text' })
    expect(sendMessage).not.toHaveBeenCalled()
    expect(document.querySelector('[data-lingoflow-generated]')).toBeNull()

    document.body.innerHTML = '<p>Translate and then clear this sentence.</p>'
    const textNode = document.querySelector('p')!.firstChild!
    Object.defineProperty(document, 'caretPositionFromPoint', {
      configurable: true,
      value: () => ({ offsetNode: textNode, offset: 10 }),
    })
    const translatingController = new HoverTranslationController({
      document,
      chromeRuntime: fakeRuntime(async message => {
        if (message.type === 'settings/getRuntime') return success(runtimeSettings())
        const task = message.payload.tasks[0] as TranslationTask
        return success({ results: [successResult(task)] })
      }),
    })
    translatingController.start()
    document.dispatchEvent(new MouseEvent('pointermove', { clientX: 40, clientY: 20 }))
    await translatingController.translateHoveredText()
    translatingController.dismiss()

    expect(document.querySelector('[data-lingoflow-partial-translation-group]')).toBeNull()
    expect(document.querySelector('p')?.textContent).toBe('Translate and then clear this sentence.')
  })
})

function resetDocument() {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
  document.getSelection()?.removeAllRanges()
}

function runtimeSettings(): PublicRuntimeSettings {
  return {
    sourceLang: 'auto',
    targetLang: 'zh-Hans',
    renderMode: 'below-original',
    cacheEnabled: false,
    maxCacheItems: 50000,
    translationConcurrency: 3,
    providerId: 'openai-compatible',
    model: 'test-model',
    promptVersion: 'prompt-v1',
    normalizeVersion: NORMALIZE_VERSION,
  }
}

function successResult(task: TranslationTask) {
  return {
    taskId: task.id,
    blockId: task.blockId,
    sourceText: task.sourceText,
    translatedText: `译：${task.sourceText}`,
    sourceLang: task.sourceLang,
    targetLang: task.targetLang,
    providerId: task.providerId,
    model: task.model,
    promptVersion: task.promptVersion,
    cacheKey: task.cacheKey,
    fromCache: false,
    status: 'success' as const,
    meta: task.meta,
  }
}

function success<T>(data: T): MessageResponse<T> {
  return { ok: true, data }
}

function fakeRuntime(
  sendMessage: (message: any) => Promise<MessageResponse<any>>,
): typeof chrome.runtime {
  return { sendMessage } as unknown as typeof chrome.runtime
}
