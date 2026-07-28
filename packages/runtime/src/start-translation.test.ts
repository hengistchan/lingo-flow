import { NORMALIZE_VERSION } from '@lingoflow/shared'
import type {
  MessageResponse,
  PageTranslationProgress,
  PublicRuntimeSettings,
  TranslationResult,
  TranslationTask,
} from '@lingoflow/types'
import { createContentRuntime } from './index'

describe('page/startTranslation messaging', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML = `
      <article>
        <p>This paragraph keeps translating after the popup that started it is closed.</p>
      </article>
    `
  })

  it('acknowledges immediately and completes independently of the popup message channel', async () => {
    let listener: (
      message: any,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response: MessageResponse<any>) => void,
    ) => boolean | undefined = () => undefined
    let releaseProvider: (() => void) | undefined
    let providerStarted = false
    const progressUpdates: PageTranslationProgress[] = []

    const chromeRuntime = {
      sendMessage: vi.fn(async (message: any) => {
        if (message.type === 'settings/getRuntime') return success(runtimeSettings())
        if (message.type === 'translation/translateBatch') {
          providerStarted = true
          await new Promise<void>(resolve => { releaseProvider = resolve })
          const tasks = message.payload.tasks as TranslationTask[]
          return success({ results: tasks.map(successResult) })
        }
        if (message.type === 'page/progressUpdate') {
          progressUpdates.push(message.payload)
          return success({ received: true })
        }
        throw new Error(`Unexpected message: ${message.type}`)
      }),
      onMessage: {
        addListener: vi.fn((next: typeof listener) => {
          listener = next
        }),
      },
    } as unknown as typeof chrome.runtime

    const runtime = createContentRuntime({ document, chromeRuntime })
    runtime.start()

    let response: MessageResponse<PageTranslationProgress> | undefined
    const keepChannelOpen = listener(
      { type: 'page/startTranslation', payload: { targetLang: 'ja' } },
      {},
      next => { response = next },
    )

    expect(keepChannelOpen).toBe(false)
    expect(response).toMatchObject({
      ok: true,
      data: {
        status: 'translating',
        targetLang: 'ja',
      },
    })

    await waitFor(() => providerStarted)
    expect(runtime.getProgress().status).toBe('translating')

    releaseProvider?.()
    await waitFor(() => runtime.getProgress().status === 'done')

    expect(runtime.getProgress()).toMatchObject({
      status: 'done',
      targetLang: 'ja',
      totalBlocks: 1,
      translatedBlocks: 1,
    })
    expect(progressUpdates.at(-1)?.status).toBe('done')
    expect(runtime.getDiagnostics()).toMatchObject({
      dynamicTranslationEnabled: true,
    })
    runtime.stop()
  })
})

function runtimeSettings(): PublicRuntimeSettings {
  return {
    sourceLang: 'auto',
    targetLang: 'zh-Hans',
    renderMode: 'below-original',
    cacheEnabled: false,
    maxCacheItems: 50000,
    translationConcurrency: 4,
    providerId: 'azure-translator',
    normalizeVersion: NORMALIZE_VERSION,
  }
}

function success<T>(data: T): MessageResponse<T> {
  return { ok: true, data }
}

function successResult(task: TranslationTask): TranslationResult {
  return {
    taskId: task.id,
    blockId: task.blockId,
    sourceText: task.sourceText,
    translatedText: `translated:${task.sourceText}`,
    insertion: task.insertion,
    sourceLang: task.sourceLang,
    targetLang: task.targetLang,
    providerId: task.providerId,
    cacheKey: task.cacheKey,
    fromCache: false,
    status: 'success',
    meta: task.meta,
  }
}

async function waitFor(assertion: () => boolean, timeoutMs = 2000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (assertion()) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error('Timed out waiting for runtime condition')
}
