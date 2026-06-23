import { NORMALIZE_VERSION } from '@lingoflow/shared'
import type {
  MessageResponse,
  PublicRuntimeSettings,
  TranslationResult,
  TranslationTask,
} from '@lingoflow/types'
import { createContentRuntime, deriveProgressStatus, evictOldestCacheEntries } from './index'

describe('content runtime language and progress behavior', () => {
  it('uses a current-page target override without changing saved defaults', async () => {
    document.body.innerHTML = `
      <article>
        <p>This paragraph is long enough to be collected and translated by the runtime.</p>
      </article>
    `
    const settings = runtimeSettings()
    let translatedTasks: TranslationTask[] = []
    const chromeRuntime = fakeRuntime(async message => {
      if (message.type === 'settings/getRuntime') return success(settings)
      if (message.type === 'translation/translateBatch') {
        translatedTasks = message.payload.tasks
        return success({
          results: translatedTasks.map(successResult),
        })
      }
      throw new Error(`Unexpected message: ${message.type}`)
    })

    const runtime = createContentRuntime({ document, chromeRuntime })
    const progress = await runtime.translatePage({ targetLang: 'ja' })

    expect(translatedTasks[0]?.targetLang).toBe('ja')
    expect(settings.targetLang).toBe('zh-Hans')
    expect(progress.targetLang).toBe('ja')
    expect(progress.status).toBe('done')
  })

  it('sends protected request text and inline tokens to translation batches', async () => {
    document.body.innerHTML = `
      <article>
        <p>Update <code>README.md</code> so <code>@vue-tui/runtime</code> documentation remains clear before the release.</p>
      </article>
    `
    const settings = runtimeSettings()
    let translatedTasks: TranslationTask[] = []
    const chromeRuntime = fakeRuntime(async message => {
      if (message.type === 'settings/getRuntime') return success(settings)
      if (message.type === 'translation/translateBatch') {
        translatedTasks = message.payload.tasks
        return success({
          results: translatedTasks.map(successResult),
        })
      }
      throw new Error(`Unexpected message: ${message.type}`)
    })

    const runtime = createContentRuntime({ document, chromeRuntime })
    await runtime.translatePage()

    expect(translatedTasks).toHaveLength(1)
    expect(translatedTasks[0].sourceText).toContain('README.md')
    expect(translatedTasks[0].requestText).toContain('⟦LF:0⟧')
    expect(translatedTasks[0].requestText).toContain('⟦LF:1⟧')
    expect(translatedTasks[0].requestText).not.toContain('README.md')
    expect(translatedTasks[0].inlineTokens?.map(token => token.text)).toEqual(expect.arrayContaining([
      'README.md',
      '@vue-tui/runtime',
    ]))
  })

  it('passes insertion metadata from collected blocks to rendered results', async () => {
    document.body.innerHTML = `
      <article>
        <p>This paragraph is long enough to be translated inside the original paragraph.</p>
      </article>
    `
    const settings = runtimeSettings()
    let translatedTasks: TranslationTask[] = []
    const chromeRuntime = fakeRuntime(async message => {
      if (message.type === 'settings/getRuntime') return success(settings)
      if (message.type === 'translation/translateBatch') {
        translatedTasks = message.payload.tasks
        return success({
          results: translatedTasks.map(task => ({
            ...successResult(task),
            translatedText: '段落内部译文',
          })),
        })
      }
      throw new Error(`Unexpected message: ${message.type}`)
    })

    const runtime = createContentRuntime({ document, chromeRuntime })
    await runtime.translatePage()

    expect(translatedTasks[0]?.insertion).toBe('linebreak-inside')
    const paragraph = document.querySelector('p') as HTMLElement
    const translation = document.querySelector('[data-lingoflow-translation]') as HTMLElement
    expect(translation.parentElement).toBe(paragraph)
    expect(translation.previousSibling?.nodeName).toBe('BR')
  })

  it('threads RuntimeContext metadata into provider tasks', async () => {
    document.body.innerHTML = `
      <article>
        <p>This paragraph is long enough to prove runtime context metadata reaches provider tasks.</p>
      </article>
    `
    const settings = runtimeSettings()
    let translatedTasks: TranslationTask[] = []
    const chromeRuntime = fakeRuntime(async message => {
      if (message.type === 'settings/getRuntime') return success(settings)
      if (message.type === 'translation/translateBatch') {
        translatedTasks = message.payload.tasks
        return success({
          results: translatedTasks.map(successResult),
        })
      }
      throw new Error(`Unexpected message: ${message.type}`)
    })

    const runtime = createContentRuntime({ document, chromeRuntime })
    await runtime.translatePage()

    expect(translatedTasks).toHaveLength(1)
    expect(translatedTasks[0]).toMatchObject({
      pageUrl: document.location.href,
      domain: 'localhost',
      meta: {
        url: document.location.href,
        domain: 'localhost',
        ruleId: 'default',
        runId: expect.stringMatching(/^run_/),
        rootGeneration: 1,
      },
    })
  })

  it('renders runtime translations inside structural table cells', async () => {
    document.body.innerHTML = `
      <article>
        <table>
          <tbody>
            <tr>
              <td><p>This table cell text is long enough to be translated inside the cell.</p></td>
            </tr>
          </tbody>
        </table>
      </article>
    `
    const settings = runtimeSettings()
    const chromeRuntime = fakeRuntime(async message => {
      if (message.type === 'settings/getRuntime') return success(settings)
      if (message.type === 'translation/translateBatch') {
        const tasks: TranslationTask[] = message.payload.tasks
        return success({
          results: tasks.map(task => ({
            ...successResult(task),
            translatedText: '表格单元格翻译',
          })),
        })
      }
      throw new Error(`Unexpected message: ${message.type}`)
    })

    const runtime = createContentRuntime({ document, chromeRuntime })
    await runtime.translatePage()

    const translation = document.querySelector('.lingoflow-translation')
    expect(translation?.textContent).toBe('表格单元格翻译')
    expect(translation?.parentElement?.tagName.toLowerCase()).toBe('td')
  })

  it('renders memory cache hits when translating the same page again', async () => {
    document.body.innerHTML = `
      <article>
        <p>This paragraph is long enough to be translated, cached in memory, and rendered again.</p>
      </article>
    `
    const settings = runtimeSettings()
    let providerCalls = 0
    const chromeRuntime = fakeRuntime(async message => {
      if (message.type === 'settings/getRuntime') return success(settings)
      if (message.type === 'translation/translateBatch') {
        providerCalls += 1
        const tasks: TranslationTask[] = message.payload.tasks
        return success({
          results: tasks.map(successResult),
        })
      }
      throw new Error(`Unexpected message: ${message.type}`)
    })

    const runtime = createContentRuntime({ document, chromeRuntime })
    await runtime.translatePage()
    expect(document.querySelectorAll('[data-lingoflow-translation]')).toHaveLength(1)

    const repeated = await runtime.translatePage()

    expect(repeated).toMatchObject({
      status: 'done',
      cacheHits: 1,
      translatedBlocks: 1,
    })
    expect(providerCalls).toBe(1)
    expect(document.querySelectorAll('[data-lingoflow-translation]')).toHaveLength(1)
  })

  it('renders loading placeholders while provider work is pending and clears them after success', async () => {
    document.body.innerHTML = `
      <article>
        <p>This paragraph is long enough to show a loading placeholder while translation is pending.</p>
      </article>
    `
    const settings = runtimeSettings()
    let translatedTasks: TranslationTask[] = []
    let resolveProvider: (() => void) | undefined
    const chromeRuntime = fakeRuntime(async message => {
      if (message.type === 'settings/getRuntime') return success(settings)
      if (message.type === 'translation/translateBatch') {
        translatedTasks = message.payload.tasks
        await new Promise<void>(resolve => {
          resolveProvider = resolve
        })
        return success({
          results: translatedTasks.map(successResult),
        })
      }
      throw new Error(`Unexpected message: ${message.type}`)
    })

    const runtime = createContentRuntime({ document, chromeRuntime })
    const progressPromise = runtime.translatePage()

    await waitFor(() => translatedTasks.length === 1)
    const loading = document.querySelector('.lingoflow-loading') as HTMLElement
    expect(loading).not.toBeNull()
    expect(loading.dataset.lingoflowLoading).toBe(translatedTasks[0].blockId)
    expect(loading.querySelectorAll('.lingoflow-dot').length).toBe(3)

    resolveProvider?.()
    await progressPromise

    expect(document.querySelector('.lingoflow-loading')).toBeNull()
    expect(document.querySelector('[data-lingoflow-translation]')?.textContent).toContain('translated:')
  })

  it('replaces loading placeholders with error placeholders for failed provider results', async () => {
    document.body.innerHTML = `
      <article>
        <p>This paragraph is long enough to show an error placeholder when translation fails.</p>
      </article>
    `
    const settings = runtimeSettings()
    let translatedTasks: TranslationTask[] = []
    const chromeRuntime = fakeRuntime(async message => {
      if (message.type === 'settings/getRuntime') return success(settings)
      if (message.type === 'translation/translateBatch') {
        translatedTasks = message.payload.tasks
        return success({
          results: translatedTasks.map(task => ({
            taskId: task.id,
            blockId: task.blockId,
            sourceText: task.sourceText,
            sourceLang: task.sourceLang,
            targetLang: task.targetLang,
            providerId: task.providerId,
            cacheKey: task.cacheKey,
            fromCache: false,
            status: 'failed' as const,
            meta: task.meta,
            error: {
              message: 'provider failed',
              reason: 'provider_failed' as const,
            },
          })),
        })
      }
      throw new Error(`Unexpected message: ${message.type}`)
    })

    const runtime = createContentRuntime({ document, chromeRuntime })
    const progress = await runtime.translatePage()

    const error = document.querySelector('.lingoflow-error') as HTMLElement
    expect(progress.status).toBe('failed')
    expect(error).not.toBeNull()
    expect(error.dataset.lingoflowError).toBe(translatedTasks[0].blockId)
    expect(error.textContent).toContain('provider failed')
    expect(document.querySelector('.lingoflow-loading')).toBeNull()
  })

  it('incrementally translates new content while dynamic translation is enabled', async () => {
    document.body.innerHTML = `
      <article>
        <p>This first paragraph is long enough to be translated before dynamic content arrives.</p>
      </article>
    `
    const settings = runtimeSettings()
    const batches: TranslationTask[][] = []
    const chromeRuntime = fakeRuntime(async message => {
      if (message.type === 'settings/getRuntime') return success(settings)
      if (message.type === 'translation/translateBatch') {
        const tasks: TranslationTask[] = message.payload.tasks
        batches.push(tasks)
        return success({
          results: tasks.map(successResult),
        })
      }
      throw new Error(`Unexpected message: ${message.type}`)
    })

    const runtime = createContentRuntime({ document, chromeRuntime })
    runtime.start()
    await runtime.translatePage()

    const firstTranslation = document.querySelector('[data-lingoflow-translation]') as HTMLElement
    expect(firstTranslation.textContent).toContain('first paragraph')

    runtime.enableDynamicTranslation()
    const dynamicParagraph = document.createElement('p')
    dynamicParagraph.textContent = 'This newly appended paragraph is long enough to be translated incrementally.'
    document.querySelector('article')!.appendChild(dynamicParagraph)

    await waitFor(() => document.querySelectorAll('[data-lingoflow-translation]').length === 2, 5000)

    expect(batches).toHaveLength(2)
    expect(batches[1]).toHaveLength(1)
    expect(batches[1][0].sourceText).toContain('newly appended paragraph')
    expect(document.body.contains(firstTranslation)).toBe(true)

    runtime.disableDynamicTranslation()
    const ignoredParagraph = document.createElement('p')
    ignoredParagraph.textContent = 'This disabled dynamic paragraph is long enough but should not be translated automatically.'
    document.querySelector('article')!.appendChild(ignoredParagraph)

    await new Promise(resolve => setTimeout(resolve, 700))

    expect(document.querySelectorAll('[data-lingoflow-translation]')).toHaveLength(2)
    runtime.stop()
  })

  it('sends translation batches with bounded concurrency', async () => {
    document.body.innerHTML = `
      <article>
        ${Array.from({ length: 41 }, (_, index) => (
          `<p>Runtime concurrency paragraph ${index} is long enough to be collected and translated.</p>`
        )).join('')}
      </article>
    `
    const settings = {
      ...runtimeSettings(),
      translationConcurrency: 2,
    }
    const startedBatchSizes: number[] = []
    const resolvers: Array<() => void> = []
    const chromeRuntime = fakeRuntime(async message => {
      if (message.type === 'settings/getRuntime') return success(settings)
      if (message.type === 'translation/translateBatch') {
        const tasks: TranslationTask[] = message.payload.tasks
        startedBatchSizes.push(tasks.length)
        return await new Promise<MessageResponse<{ results: TranslationResult[] }>>(resolve => {
          resolvers.push(() => resolve(success({ results: tasks.map(successResult) })))
        })
      }
      throw new Error(`Unexpected message: ${message.type}`)
    })

    const runtime = createContentRuntime({ document, chromeRuntime })
    const progressPromise = runtime.translatePage()

    await waitFor(() => startedBatchSizes.length >= 2)
    expect(startedBatchSizes).toEqual([20, 20])

    resolvers[0]()
    await waitFor(() => startedBatchSizes.length >= 3)
    expect(startedBatchSizes).toEqual([20, 20, 1])

    resolvers[1]()
    resolvers[2]()
    await expect(progressPromise).resolves.toMatchObject({
      status: 'done',
      translatedBlocks: 41,
    })
  })

  it('derives honest terminal states', () => {
    expect(deriveProgressStatus({ translated: 3, failed: 0, total: 3 })).toBe('done')
    expect(deriveProgressStatus({ translated: 2, failed: 1, total: 3 })).toBe('partial')
    expect(deriveProgressStatus({ translated: 0, failed: 3, total: 3 })).toBe('failed')
    expect(deriveProgressStatus({ translated: 0, failed: 0, total: 0 })).toBe('failed')
  })

  it("Returns failed when all blocks failed with none translated", () => {
    expect(deriveProgressStatus({ translated: 0, failed: 5, total: 10 })).toBe("failed")
  })

  it("Returns failed when no blocks were found", () => {
    expect(deriveProgressStatus({ translated: 0, failed: 0, total: 0 })).toBe("failed")
  })
})

function runtimeSettings(): PublicRuntimeSettings {
  return {
    sourceLang: 'auto',
    targetLang: 'zh-Hans',
    renderMode: 'below-original',
    cacheEnabled: false,
    maxCacheItems: 50000,
    translationConcurrency: 3,
    providerId: 'azure-translator',
    normalizeVersion: NORMALIZE_VERSION,
  }
}

function fakeRuntime(
  sendMessage: (message: any) => Promise<MessageResponse<any>>,
): typeof chrome.runtime {
  return {
    sendMessage,
    onMessage: {
      addListener: vi.fn(),
    },
  } as unknown as typeof chrome.runtime
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

async function waitFor(assertion: () => boolean, timeoutMs = 1000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (assertion()) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error('Timed out waiting for runtime condition')
}

describe('dirty block retranslation', () => {
  it('translates, detects mutation, removes old translation, retranslates, and renders new translation', async () => {
    vi.useFakeTimers()
    document.body.innerHTML = `
      <article>
        <p>This paragraph is long enough to be collected and translated by the runtime.</p>
      </article>
    `
    const settings = runtimeSettings()
    const translatedTasks: TranslationTask[][] = []
    const chromeRuntime = fakeRuntime(async message => {
      if (message.type === 'settings/getRuntime') return success(settings)
      if (message.type === 'translation/translateBatch') {
        const tasks: TranslationTask[] = message.payload.tasks
        translatedTasks.push(tasks)
        return success({
          results: tasks.map(task => ({
            ...successResult(task),
            translatedText: `translated:${task.sourceText}`,
          })),
        })
      }
      throw new Error(`Unexpected message: ${message.type}`)
    })

    const runtime = createContentRuntime({ document, chromeRuntime })
    runtime.start()
    await runtime.translatePage()

    const paragraph = document.querySelector('p') as HTMLElement
    const firstTranslation = document.querySelector('[data-lingoflow-translation]') as HTMLElement
    expect(firstTranslation).not.toBeNull()
    expect(firstTranslation.textContent).toContain('translated:')
    expect(paragraph.dataset.lingoflowBlockId).toBeTruthy()

    paragraph.textContent = 'The source text has been mutated to simulate dynamic content changes.'

    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(80)

    expect(document.querySelector('[data-lingoflow-translation]')).toBeNull()

    await runtime.translatePage()

    expect(translatedTasks).toHaveLength(2)
    expect(translatedTasks[1]).toHaveLength(1)
    expect(translatedTasks[1][0].sourceText).toContain('mutated to simulate dynamic')

    const newTranslation = document.querySelector('[data-lingoflow-translation]') as HTMLElement
    expect(newTranslation).not.toBeNull()
    expect(newTranslation.textContent).toContain('mutated to simulate dynamic')

    runtime.stop()
    vi.useRealTimers()
  })

  it('does nothing when mutating a block that has not been translated yet', async () => {
    vi.useFakeTimers()
    document.body.innerHTML = `
      <article>
        <p>This paragraph has not been translated yet so mutations should be ignored.</p>
      </article>
    `
    const settings = runtimeSettings()
    let providerCalls = 0
    const chromeRuntime = fakeRuntime(async message => {
      if (message.type === 'settings/getRuntime') return success(settings)
      if (message.type === 'translation/translateBatch') {
        providerCalls += 1
        const tasks: TranslationTask[] = message.payload.tasks
        return success({ results: tasks.map(successResult) })
      }
      throw new Error(`Unexpected message: ${message.type}`)
    })

    const runtime = createContentRuntime({ document, chromeRuntime })
    runtime.start()

    const paragraph = document.querySelector('p') as HTMLElement
    paragraph.textContent = 'Mutated before any translation occurred.'

    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(80)

    expect(providerCalls).toBe(0)
    expect(document.querySelector('[data-lingoflow-translation]')).toBeNull()

    runtime.stop()
    vi.useRealTimers()
  })

  it('debounces multiple rapid mutations into a single dirty event', async () => {
    vi.useFakeTimers()
    document.body.innerHTML = `
      <article>
        <p>This paragraph is long enough to test rapid mutation debounce behavior.</p>
      </article>
    `
    const settings = runtimeSettings()
    const translatedTasks: TranslationTask[][] = []
    const chromeRuntime = fakeRuntime(async message => {
      if (message.type === 'settings/getRuntime') return success(settings)
      if (message.type === 'translation/translateBatch') {
        const tasks: TranslationTask[] = message.payload.tasks
        translatedTasks.push(tasks)
        return success({
          results: tasks.map(task => ({
            ...successResult(task),
            translatedText: `translated:${task.sourceText}`,
          })),
        })
      }
      throw new Error(`Unexpected message: ${message.type}`)
    })

    const runtime = createContentRuntime({ document, chromeRuntime })
    runtime.start()
    await runtime.translatePage()

    expect(translatedTasks).toHaveLength(1)

    const paragraph = document.querySelector('p') as HTMLElement
    paragraph.textContent = 'First rapid mutation text.'
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(20)

    paragraph.textContent = 'Second rapid mutation text.'
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(20)

    paragraph.textContent = 'Third and final rapid mutation text.'

    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(80)

    expect(document.querySelector('[data-lingoflow-translation]')).toBeNull()

    await runtime.translatePage()

    expect(translatedTasks).toHaveLength(2)
    expect(translatedTasks[1]).toHaveLength(1)
    expect(translatedTasks[1][0].sourceText).toContain('Third and final rapid mutation')

    const newTranslation = document.querySelector('[data-lingoflow-translation]') as HTMLElement
    expect(newTranslation).not.toBeNull()

    runtime.stop()
    vi.useRealTimers()
  })
})

describe("evictOldestCacheEntries", () => {
  it("Evicts the oldest entries when cache exceeds the limit", () => {
    const cache = new Map()
    for (let i = 0; i < 5; i++) {
      cache.set("key_" + i, { status: "success", cacheKey: "key_" + i })
    }
    evictOldestCacheEntries(cache, 3)
    expect(cache.size).toBe(3)
    expect(cache.has("key_0")).toBe(false)
    expect(cache.has("key_1")).toBe(false)
    expect(cache.has("key_2")).toBe(true)
    expect(cache.has("key_3")).toBe(true)
    expect(cache.has("key_4")).toBe(true)
  })

  it("Does nothing when cache is within the limit", () => {
    const cache = new Map()
    cache.set("a", { status: "success", cacheKey: "a" })
    evictOldestCacheEntries(cache, 5)
    expect(cache.size).toBe(1)
  })

  it("Handles empty cache without error", () => {
    const cache = new Map()
    evictOldestCacheEntries(cache, 10)
    expect(cache.size).toBe(0)
  })
})

describe('translateIncremental queuing', () => {
  it('queues a request when called while another is in progress', async () => {
    document.body.innerHTML = `
      <article>
        <p>This paragraph is long enough for the first incremental translation.</p>
      </article>
    `
    const settings = runtimeSettings()
    let resolveFirst: (() => void) | undefined
    const batches: TranslationTask[][] = []
    const chromeRuntime = fakeRuntime(async message => {
      if (message.type === 'settings/getRuntime') return success(settings)
      if (message.type === 'translation/translateBatch') {
        const tasks: TranslationTask[] = message.payload.tasks
        batches.push(tasks)
        if (batches.length === 1) {
          await new Promise<void>(resolve => { resolveFirst = resolve })
        }
        return success({ results: tasks.map(successResult) })
      }
      throw new Error(`Unexpected message: ${message.type}`)
    })

    const runtime = createContentRuntime({ document, chromeRuntime })

    const first = runtime.translateIncremental()
    await waitFor(() => batches.length === 1)

    const dynamicP = document.createElement('p')
    dynamicP.textContent = 'This new paragraph is long enough to be collected for incremental translation.'
    document.querySelector('article')!.appendChild(dynamicP)

    runtime.translateIncremental()
    expect(batches).toHaveLength(1)

    resolveFirst!()
    await first

    await waitFor(() => batches.length === 2)
    expect(batches).toHaveLength(2)
  })

  it('runs queued request after the first completes', async () => {
    document.body.innerHTML = `
      <article>
        <p>First incremental paragraph is long enough to be translated.</p>
      </article>
    `
    const settings = runtimeSettings()
    let resolveFirst: (() => void) | undefined
    const batches: TranslationTask[][] = []
    const chromeRuntime = fakeRuntime(async message => {
      if (message.type === 'settings/getRuntime') return success(settings)
      if (message.type === 'translation/translateBatch') {
        const tasks: TranslationTask[] = message.payload.tasks
        batches.push(tasks)
        if (batches.length === 1) {
          await new Promise<void>(resolve => { resolveFirst = resolve })
        }
        return success({ results: tasks.map(successResult) })
      }
      throw new Error(`Unexpected message: ${message.type}`)
    })

    const runtime = createContentRuntime({ document, chromeRuntime })

    const first = runtime.translateIncremental()
    await waitFor(() => batches.length === 1)

    const dynamicP = document.createElement('p')
    dynamicP.textContent = 'Second incremental paragraph is also long enough to be collected.'
    document.querySelector('article')!.appendChild(dynamicP)

    runtime.translateIncremental()
    resolveFirst!()

    await first
    await waitFor(() => batches.length === 2)

    expect(batches).toHaveLength(2)
    expect(batches[0]).toHaveLength(1)
    expect(batches[1]).toHaveLength(1)
  })

  it('keeps only the latest overrides when multiple rapid calls occur', async () => {
    document.body.innerHTML = `
      <article>
        <p>Paragraph for testing rapid incremental override coalescing.</p>
      </article>
    `
    const settings = runtimeSettings()
    let resolveFirst: (() => void) | undefined
    const batches: TranslationTask[][] = []
    const targetLangs: string[] = []
    const chromeRuntime = fakeRuntime(async message => {
      if (message.type === 'settings/getRuntime') return success(settings)
      if (message.type === 'translation/translateBatch') {
        const tasks: TranslationTask[] = message.payload.tasks
        batches.push(tasks)
        targetLangs.push(tasks[0]?.targetLang)
        if (batches.length === 1) {
          await new Promise<void>(resolve => { resolveFirst = resolve })
        }
        return success({ results: tasks.map(successResult) })
      }
      throw new Error(`Unexpected message: ${message.type}`)
    })

    const runtime = createContentRuntime({ document, chromeRuntime })

    const first = runtime.translateIncremental()
    await waitFor(() => batches.length === 1)

    const dynamicP = document.createElement('p')
    dynamicP.textContent = 'Dynamic paragraph for testing coalesced override propagation.'
    document.querySelector('article')!.appendChild(dynamicP)

    runtime.translateIncremental({ targetLang: 'ja' })
    runtime.translateIncremental({ targetLang: 'ko' })

    resolveFirst!()
    await first

    await waitFor(() => batches.length === 2)

    expect(batches).toHaveLength(2)
    expect(targetLangs[0]).toBe(settings.targetLang)
    expect(targetLangs[1]).toBe('ko')
  })
})
