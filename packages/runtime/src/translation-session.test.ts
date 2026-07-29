import { NORMALIZE_VERSION } from '@lingoflow/shared'
import type {
  MessageResponse,
  PageTranslationProgress,
  PublicRuntimeSettings,
  TranslationResult,
  TranslationTask,
} from '@lingoflow/types'
import { createContentRuntime } from './index'

describe('interruptible translation sessions', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
  })

  it('cancels within the interaction budget, clears loading, and discards a late result', async () => {
    document.body.innerHTML = articleWithParagraphs(1)
    let listener: MessageListener = () => undefined
    let pendingBatch: PendingBatch | undefined
    const cancelledSessionIds: string[] = []
    const progressUpdates: PageTranslationProgress[] = []
    const chromeRuntime = createRuntimeMock({
      onListener: next => { listener = next },
      onBatch: (tasks, sessionId) => new Promise(resolve => {
        pendingBatch = {
          tasks,
          sessionId,
          resolve: results => resolve(success({ results })),
        }
      }),
      onCancel: sessionId => {
        cancelledSessionIds.push(sessionId)
        return new Promise<MessageResponse<{ cancelled: boolean }>>(() => {
          // A hung background acknowledgement must not delay local cancellation.
        })
      },
      onProgress: progress => {
        progressUpdates.push(progress)
      },
    })
    const runtime = createContentRuntime({ document, chromeRuntime })
    runtime.start()
    runtime.enableDynamicTranslation()

    const translation = runtime.translatePage()
    await waitFor(() => Boolean(pendingBatch))

    const started = performance.now()
    let keepChannelOpen: boolean | undefined
    const responsePromise = new Promise<MessageResponse<PageTranslationProgress>>(resolve => {
      keepChannelOpen = listener(
        { type: 'page/cancelTranslation' },
        {},
        resolve,
      )
    })
    const response = await responsePromise
    const elapsed = performance.now() - started

    expect(keepChannelOpen).toBe(false)
    expect(elapsed).toBeLessThan(300)
    expect(response).toMatchObject({
      ok: true,
      data: {
        status: 'cancelled',
        sessionId: pendingBatch!.sessionId,
        cancelledBlocks: 1,
        retryableBlocks: 1,
      },
    })
    expect(cancelledSessionIds).toEqual([pendingBatch!.sessionId])
    expect(progressUpdates.map(update => update.status)).toEqual(
      expect.arrayContaining(['cancelling', 'cancelled']),
    )
    expect(document.querySelector('.lingoflow-loading')).toBeNull()

    pendingBatch!.resolve(pendingBatch!.tasks.map(successResult))
    await translation

    expect(runtime.getProgress().status).toBe('cancelled')
    expect(document.querySelector('[data-lingoflow-translation]')).toBeNull()
    expect((await runtime.runDryDiagnostics()).dynamicTranslationEnabled).toBe(false)
    runtime.stop()
  })

  it('preserves completed blocks and retries only the cancelled remainder with a fresh session', async () => {
    document.body.innerHTML = articleWithParagraphs(21)
    const batches: PendingBatch[] = []
    const chromeRuntime = createRuntimeMock({
      settings: { ...runtimeSettings(), translationConcurrency: 1 },
      onBatch: (tasks, sessionId) => new Promise(resolve => {
        batches.push({
          tasks,
          sessionId,
          resolve: results => resolve(success({ results })),
        })
      }),
    })
    const runtime = createContentRuntime({ document, chromeRuntime })

    const original = runtime.translatePage()
    await waitFor(() => batches.length === 1)
    const originalSessionId = batches[0].sessionId
    batches[0].resolve(batches[0].tasks.map(successResult))
    await waitFor(() => batches.length === 2)

    const completedTranslations = [...document.querySelectorAll('[data-lingoflow-translation]')]
    expect(completedTranslations).toHaveLength(20)

    const cancelled = await runtime.cancelTranslation()
    expect(cancelled).toMatchObject({
      status: 'cancelled',
      translatedBlocks: 20,
      cancelledBlocks: 1,
      retryableBlocks: 1,
    })

    batches[1].resolve(batches[1].tasks.map(successResult))
    await original
    expect(document.querySelectorAll('[data-lingoflow-translation]')).toHaveLength(20)

    const retry = runtime.retryFailedTranslation()
    const retrySessionId = runtime.getProgress().sessionId
    expect(runtime.getProgress()).toMatchObject({
      status: 'translating',
      translatedBlocks: 20,
      retryableBlocks: 1,
    })
    expect(retrySessionId).toBeTruthy()
    expect(retrySessionId).not.toBe(originalSessionId)

    await waitFor(() => batches.length === 3)
    expect(batches[2].sessionId).toBe(retrySessionId)
    expect(batches[2].tasks).toHaveLength(1)
    expect(batches[2].tasks[0].sourceText).toContain('paragraph 20')
    expect(completedTranslations.every(node => node.isConnected)).toBe(true)

    batches[2].resolve(batches[2].tasks.map(successResult))
    await expect(retry).resolves.toMatchObject({
      status: 'done',
      totalBlocks: 21,
      translatedBlocks: 21,
      retryableBlocks: 0,
    })
    expect(document.querySelectorAll('[data-lingoflow-translation]')).toHaveLength(21)
  })

  it('does not start queued batches after cancellation', async () => {
    document.body.innerHTML = articleWithParagraphs(61)
    const batches: PendingBatch[] = []
    const chromeRuntime = createRuntimeMock({
      settings: { ...runtimeSettings(), translationConcurrency: 2 },
      onBatch: (tasks, sessionId) => new Promise(resolve => {
        batches.push({
          tasks,
          sessionId,
          resolve: results => resolve(success({ results })),
        })
      }),
    })
    const runtime = createContentRuntime({ document, chromeRuntime })

    const translation = runtime.translatePage()
    await waitFor(() => batches.length === 2)
    await runtime.cancelTranslation()

    for (const batch of batches) {
      batch.resolve(batch.tasks.map(successResult))
    }
    await translation
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(batches).toHaveLength(2)
    expect(runtime.getProgress()).toMatchObject({
      status: 'cancelled',
      translatedBlocks: 0,
      cancelledBlocks: 61,
      retryableBlocks: 61,
    })
    expect(document.querySelector('.lingoflow-loading')).toBeNull()
  })

  it('starts a new session when the target language changes and never renders the old result', async () => {
    document.body.innerHTML = articleWithParagraphs(1)
    const batches: PendingBatch[] = []
    const chromeRuntime = createRuntimeMock({
      onBatch: (tasks, sessionId) => new Promise(resolve => {
        batches.push({
          tasks,
          sessionId,
          resolve: results => resolve(success({ results })),
        })
      }),
    })
    const runtime = createContentRuntime({ document, chromeRuntime })

    const first = runtime.translatePage({ targetLang: 'zh-Hans' })
    await waitFor(() => batches.length === 1)
    const second = runtime.translatePage({ targetLang: 'ja' })
    await waitFor(() => batches.length === 2)

    expect(batches[1].sessionId).not.toBe(batches[0].sessionId)
    expect(batches[1].tasks[0].targetLang).toBe('ja')

    batches[1].resolve(batches[1].tasks.map(task => ({
      ...successResult(task),
      translatedText: `new-session:${task.sourceText}`,
    })))
    await second

    batches[0].resolve(batches[0].tasks.map(task => ({
      ...successResult(task),
      translatedText: `old-session:${task.sourceText}`,
    })))
    await first

    const translation = document.querySelector('[data-lingoflow-translation]')
    expect(translation?.textContent).toContain('new-session:')
    expect(translation?.textContent).not.toContain('old-session:')
    expect(runtime.getProgress()).toMatchObject({
      status: 'done',
      targetLang: 'ja',
      sessionId: batches[1].sessionId,
    })
  })

  it('abandons a hung session on route change and immediately translates the new route', async () => {
    document.body.innerHTML = articleWithParagraphs(1)
    const batches: PendingBatch[] = []
    const cancelledSessionIds: string[] = []
    const chromeRuntime = createRuntimeMock({
      onBatch: (tasks, sessionId) => {
        if (batches.length === 0) {
          return new Promise(resolve => {
            batches.push({
              tasks,
              sessionId,
              resolve: results => resolve(success({ results })),
            })
          })
        }

        batches.push({
          tasks,
          sessionId,
          resolve: () => undefined,
        })
        return Promise.resolve(success({ results: tasks.map(successResult) }))
      },
      onCancel: sessionId => {
        cancelledSessionIds.push(sessionId)
        return new Promise<MessageResponse<{ cancelled: boolean }>>(() => {
          // Route translation must not wait for background cancellation.
        })
      },
    })
    const runtime = createContentRuntime({ document, chromeRuntime })
    runtime.start()
    runtime.enableDynamicTranslation()

    const oldTranslation = runtime.translatePage()
    await waitFor(() => batches.length === 1)
    const oldSessionId = batches[0].sessionId

    document.querySelector('article')!.innerHTML = `
      <p>The new route paragraph must translate while the previous provider request is still hung.</p>
    `
    history.pushState({}, '', '/session-route-change')

    await waitFor(() => batches.length === 2)
    expect(cancelledSessionIds).toEqual([oldSessionId])
    expect(batches[1].sessionId).not.toBe(oldSessionId)
    expect(batches[1].tasks).toHaveLength(1)
    expect(batches[1].tasks[0].sourceText).toContain('new route paragraph')
    await waitFor(() => Boolean(document.querySelector('[data-lingoflow-translation]')))

    expect(document.querySelector('[data-lingoflow-translation]')?.textContent).toContain(
      'new route paragraph',
    )
    expect(runtime.getProgress()).toMatchObject({
      status: 'done',
      sessionId: batches[1].sessionId,
      translatedBlocks: 1,
    })
    expect((await runtime.runDryDiagnostics()).dynamicTranslationEnabled).toBe(true)

    batches[0].resolve(batches[0].tasks.map(task => ({
      ...successResult(task),
      translatedText: `old-route:${task.sourceText}`,
    })))
    await oldTranslation
    expect(document.body.textContent).not.toContain('old-route:')
    runtime.stop()
  })

  it('retries provider failures without retranslating successful blocks', async () => {
    document.body.innerHTML = articleWithParagraphs(2)
    const requestedBatches: Array<{ tasks: TranslationTask[]; sessionId: string }> = []
    const chromeRuntime = createRuntimeMock({
      onBatch: async (tasks, sessionId) => {
        requestedBatches.push({ tasks, sessionId })
        if (requestedBatches.length === 1) {
          return success({
            results: [
              successResult(tasks[0]),
              failedResult(tasks[1]),
            ],
          })
        }
        return success({ results: tasks.map(successResult) })
      },
    })
    const runtime = createContentRuntime({ document, chromeRuntime })

    const first = await runtime.translatePage()
    expect(first).toMatchObject({
      status: 'partial',
      totalBlocks: 2,
      translatedBlocks: 1,
      failedBlocks: 1,
      retryableBlocks: 1,
    })
    const firstTranslation = document.querySelector('[data-lingoflow-translation]')
    const firstSessionId = first.sessionId

    const retried = await runtime.retryFailedTranslation()

    expect(requestedBatches).toHaveLength(2)
    expect(requestedBatches[1].tasks).toHaveLength(1)
    expect(requestedBatches[1].tasks[0].sourceText).toContain('paragraph 1')
    expect(requestedBatches[1].sessionId).not.toBe(firstSessionId)
    expect(firstTranslation?.isConnected).toBe(true)
    expect(retried).toMatchObject({
      status: 'done',
      totalBlocks: 2,
      translatedBlocks: 2,
      failedBlocks: 0,
      retryableBlocks: 0,
    })
  })

  it('preserves a successful same-text result while retrying only the failed block', async () => {
    document.body.innerHTML = articleWithParagraphs(3)
    const requestedBatches: Array<{ tasks: TranslationTask[]; sessionId: string }> = []
    const chromeRuntime = createRuntimeMock({
      onBatch: async (tasks, sessionId) => {
        requestedBatches.push({ tasks, sessionId })
        if (requestedBatches.length === 1) {
          return success({
            results: [
              successResult(tasks[0]),
              {
                ...successResult(tasks[1]),
                translatedText: tasks[1].sourceText,
              },
              failedResult(tasks[2]),
            ],
          })
        }
        return success({ results: tasks.map(successResult) })
      },
    })
    const runtime = createContentRuntime({ document, chromeRuntime })

    await expect(runtime.translatePage()).resolves.toMatchObject({
      status: 'partial',
      totalBlocks: 3,
      translatedBlocks: 2,
      failedBlocks: 1,
      retryableBlocks: 1,
    })
    expect(document.querySelectorAll('[data-lingoflow-translation]')).toHaveLength(1)

    await expect(runtime.retryFailedTranslation()).resolves.toMatchObject({
      status: 'done',
      totalBlocks: 3,
      translatedBlocks: 3,
      failedBlocks: 0,
      retryableBlocks: 0,
    })
    expect(requestedBatches).toHaveLength(2)
    expect(requestedBatches[1].tasks).toHaveLength(1)
    expect(requestedBatches[1].tasks[0].sourceText).toContain('paragraph 2')
  })

  it('drains dynamic content queued while a failed-block retry is in progress', async () => {
    document.body.innerHTML = articleWithParagraphs(2)
    const requestedBatches: Array<{ tasks: TranslationTask[]; sessionId: string }> = []
    let finishRetry: ((results: TranslationResult[]) => void) | undefined
    const chromeRuntime = createRuntimeMock({
      onBatch: async (tasks, sessionId) => {
        requestedBatches.push({ tasks, sessionId })
        if (requestedBatches.length === 1) {
          return success({
            results: [
              successResult(tasks[0]),
              failedResult(tasks[1]),
            ],
          })
        }
        if (requestedBatches.length === 2) {
          return new Promise(resolve => {
            finishRetry = results => resolve(success({ results }))
          })
        }
        return success({ results: tasks.map(successResult) })
      },
    })
    const runtime = createContentRuntime({ document, chromeRuntime })
    runtime.start()
    runtime.enableDynamicTranslation()

    await runtime.translatePage()
    const retry = runtime.retryFailedTranslation()
    await waitFor(() => requestedBatches.length === 2)

    const added = document.createElement('p')
    added.textContent =
      'Dynamic content added during a retry must be translated after that retry finishes.'
    document.querySelector('article')!.appendChild(added)
    await new Promise(resolve => setTimeout(resolve, 700))
    expect(requestedBatches).toHaveLength(2)

    finishRetry!(requestedBatches[1].tasks.map(successResult))
    await retry
    await waitFor(() => requestedBatches.length === 3)
    await waitFor(() => document.body.textContent?.includes(
      'translated:Dynamic content added during a retry',
    ) ?? false)

    expect(requestedBatches[2].tasks).toHaveLength(1)
    expect(requestedBatches[2].tasks[0].sourceText).toContain(
      'Dynamic content added during a retry',
    )
    runtime.stop()
  }, 10_000)
})

type MessageListener = (
  message: any,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: MessageResponse<any>) => void,
) => boolean | undefined

type PendingBatch = {
  tasks: TranslationTask[]
  sessionId: string
  resolve: (results: TranslationResult[]) => void
}

function createRuntimeMock(options: {
  settings?: PublicRuntimeSettings
  onListener?: (listener: MessageListener) => void
  onBatch: (
    tasks: TranslationTask[],
    sessionId: string,
  ) => Promise<MessageResponse<{ results: TranslationResult[] }>>
  onCancel?: (
    sessionId: string,
  ) => void | Promise<MessageResponse<{ cancelled: boolean }>>
  onProgress?: (progress: PageTranslationProgress) => void
}): typeof chrome.runtime {
  return {
    sendMessage: vi.fn(async (message: any) => {
      if (message.type === 'settings/getRuntime') {
        return success(options.settings ?? runtimeSettings())
      }
      if (message.type === 'translation/translateBatch') {
        return options.onBatch(message.payload.tasks, message.payload.sessionId)
      }
      if (message.type === 'translation/cancelSession') {
        const response = options.onCancel?.(message.payload.sessionId)
        if (response) return response
        return success({ cancelled: true })
      }
      if (message.type === 'page/progressUpdate') {
        options.onProgress?.(message.payload)
        return success({ received: true })
      }
      throw new Error(`Unexpected message: ${message.type}`)
    }),
    onMessage: {
      addListener: vi.fn((listener: MessageListener) => {
        options.onListener?.(listener)
      }),
    },
  } as unknown as typeof chrome.runtime
}

function articleWithParagraphs(count: number): string {
  return `
    <article>
      ${Array.from({ length: count }, (_, index) => (
        `<p>Translation session paragraph ${index} is long enough to be collected independently.</p>`
      )).join('')}
    </article>
  `
}

function runtimeSettings(): PublicRuntimeSettings {
  return {
    sourceLang: 'auto',
    targetLang: 'zh-Hans',
    renderMode: 'below-original',
    cacheEnabled: false,
    maxCacheItems: 50000,
    translationConcurrency: 1,
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

function failedResult(task: TranslationTask): TranslationResult {
  return {
    taskId: task.id,
    blockId: task.blockId,
    sourceText: task.sourceText,
    insertion: task.insertion,
    sourceLang: task.sourceLang,
    targetLang: task.targetLang,
    providerId: task.providerId,
    cacheKey: task.cacheKey,
    fromCache: false,
    status: 'failed',
    meta: task.meta,
    error: {
      message: 'provider failed',
      reason: 'provider_network_error',
    },
  }
}

async function waitFor(assertion: () => boolean, timeoutMs = 2000): Promise<void> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (assertion()) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error('Timed out waiting for runtime condition')
}
