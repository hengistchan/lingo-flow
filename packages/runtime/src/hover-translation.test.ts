import { NORMALIZE_VERSION } from '@lingoflow/shared'
import type { MessageResponse, PublicRuntimeSettings, TranslationTask } from '@lingoflow/types'
import {
  HoverTranslationController,
  isHoverTranslationShortcut,
  resolveTextAtPoint,
  segmentSentenceAtOffset,
} from './hover-translation'

describe('hover sentence resolution', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
    document.getSelection()?.removeAllRanges()
    document.querySelectorAll('[data-lingoflow-hover-card]').forEach(node => node.remove())
  })

  it('segments the sentence containing the caret for English and Chinese punctuation', () => {
    const english = 'First sentence. The sentence under the pointer is here! Last sentence.'
    expect(segmentSentenceAtOffset(english, english.indexOf('pointer'))?.text)
      .toBe('The sentence under the pointer is here!')

    const chinese = '第一句。鼠标下面的句段需要单独翻译！最后一句。'
    expect(segmentSentenceAtOffset(chinese, chinese.indexOf('句段'))?.text)
      .toBe('鼠标下面的句段需要单独翻译！')
  })

  it('resolves the precise sentence from a caret point inside a paragraph', () => {
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
      source: 'caret',
      anchor: { x: 120, y: 80 },
    })
  })

  it('recognizes only the non-repeating Alt/Option + Shift + L chord', () => {
    expect(isHoverTranslationShortcut(shortcut())).toBe(true)
    expect(isHoverTranslationShortcut(shortcut({ code: 'KeyT' }))).toBe(false)
    expect(isHoverTranslationShortcut(shortcut({ ctrlKey: true }))).toBe(false)
    expect(isHoverTranslationShortcut(shortcut({ repeat: true }))).toBe(false)
  })
})

describe('HoverTranslationController', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
    document.getSelection()?.removeAllRanges()
    document.querySelectorAll('[data-lingoflow-hover-card]').forEach(node => node.remove())
  })

  it('translates the sentence under the pointer and renders an isolated bilingual note', async () => {
    document.body.innerHTML = '<article><p>Do not translate this. Translate the sentence under the mouse. Leave this alone.</p></article>'
    const textNode = document.querySelector('p')!.firstChild!
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
    document.dispatchEvent(new KeyboardEvent('keydown', {
      code: 'KeyL',
      key: 'L',
      altKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    }))

    await vi.waitFor(() => {
      expect(document.querySelector('[data-lingoflow-hover-card]')?.getAttribute('data-state')).toBe('success')
    })
    expect(translatedTask?.sourceText).toBe('Translate the sentence under the mouse.')
    const host = document.querySelector('[data-lingoflow-hover-card]') as HTMLElement
    expect(host.dataset.lingoflowGenerated).toBe('true')
    expect(host.shadowRoot?.textContent).toContain('Translate the sentence under the mouse.')
    expect(host.shadowRoot?.textContent).toContain('译：Translate the sentence under the mouse.')

    controller.stop()
  })

  it('does not trigger while typing in editable controls', async () => {
    document.body.innerHTML = '<input value="typing"><p>Readable sentence under the pointer.</p>'
    const sendMessage = vi.fn(async () => success(runtimeSettings()))
    const controller = new HoverTranslationController({
      document,
      chromeRuntime: fakeRuntime(sendMessage),
    })
    controller.start()

    const input = document.querySelector('input')!
    input.dispatchEvent(new KeyboardEvent('keydown', {
      code: 'KeyL',
      key: 'L',
      altKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    }))
    await Promise.resolve()

    expect(sendMessage).not.toHaveBeenCalled()
    expect(document.querySelector('[data-lingoflow-hover-card]')).toBeNull()
    controller.stop()
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
    controller.stop()
  })
})

function shortcut(overrides: Partial<Parameters<typeof isHoverTranslationShortcut>[0]> = {}) {
  return {
    altKey: true,
    shiftKey: true,
    ctrlKey: false,
    metaKey: false,
    code: 'KeyL',
    repeat: false,
    isComposing: false,
    ...overrides,
  }
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
