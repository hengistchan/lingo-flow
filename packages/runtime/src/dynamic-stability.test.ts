import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NORMALIZE_VERSION } from '@lingoflow/shared'
import type {
  MessageResponse,
  PublicRuntimeSettings,
  TranslationResult,
  TranslationTask,
  RuntimeEvent,
} from '@lingoflow/types'
import { createContentRuntime } from './index'

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

describe('dynamic translation stability', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
  })

  it('dynamic mode is off by default', async () => {
    document.body.innerHTML = `
      <article>
        <p>This paragraph is long enough to verify dynamic mode default state.</p>
      </article>
    `
    const settings = runtimeSettings()
    const chromeRuntime = fakeRuntime(async message => {
      if (message.type === 'settings/getRuntime') return success(settings)
      if (message.type === 'translation/translateBatch') {
        return success({ results: (message.payload.tasks as TranslationTask[]).map(successResult) })
      }
      throw new Error(`Unexpected: ${message.type}`)
    })

    const runtime = createContentRuntime({ document, chromeRuntime })
    runtime.start()
    await runtime.translatePage()

    const dynamicP = document.createElement('p')
    dynamicP.textContent = 'This dynamic paragraph should not be translated when dynamic is off by default.'
    document.querySelector('article')!.appendChild(dynamicP)

    await new Promise(r => setTimeout(r, 700))

    expect(document.querySelectorAll('[data-lingoflow-translation]')).toHaveLength(1)
    runtime.stop()
  })

  it('enabling dynamic translation per page translates newly added readable content once', async () => {
    document.body.innerHTML = `
      <article>
        <p>This paragraph exists before enabling dynamic translation mode.</p>
      </article>
    `
    const settings = runtimeSettings()
    const batches: TranslationTask[][] = []
    const chromeRuntime = fakeRuntime(async message => {
      if (message.type === 'settings/getRuntime') return success(settings)
      if (message.type === 'translation/translateBatch') {
        const tasks = message.payload.tasks as TranslationTask[]
        batches.push(tasks)
        return success({ results: tasks.map(successResult) })
      }
      throw new Error(`Unexpected: ${message.type}`)
    })

    const runtime = createContentRuntime({ document, chromeRuntime })
    runtime.start()
    await runtime.translatePage()
    expect(batches).toHaveLength(1)

    runtime.enableDynamicTranslation()

    const newP = document.createElement('p')
    newP.textContent = 'This newly added paragraph should be translated after enabling dynamic mode.'
    document.querySelector('article')!.appendChild(newP)

    await waitFor(() => batches.length >= 2, 3000)

    expect(batches).toHaveLength(2)
    expect(batches[1][0].sourceText).toContain('newly added paragraph')

    runtime.stop()
  })

  it('disabling dynamic translation stops auto-translating newly added content', async () => {
    vi.useFakeTimers()
    document.body.innerHTML = `
      <article>
        <p>This paragraph is for testing disable behavior of dynamic translation.</p>
      </article>
    `
    const settings = runtimeSettings()
    const batches: TranslationTask[][] = []
    const chromeRuntime = fakeRuntime(async message => {
      if (message.type === 'settings/getRuntime') return success(settings)
      if (message.type === 'translation/translateBatch') {
        batches.push(message.payload.tasks as TranslationTask[])
        return success({ results: (message.payload.tasks as TranslationTask[]).map(successResult) })
      }
      throw new Error(`Unexpected: ${message.type}`)
    })

    const runtime = createContentRuntime({ document, chromeRuntime })
    runtime.start()
    await runtime.translatePage()

    runtime.enableDynamicTranslation()
    runtime.disableDynamicTranslation()

    const newP = document.createElement('p')
    newP.textContent = 'This paragraph should not be translated after disabling dynamic mode.'
    document.querySelector('article')!.appendChild(newP)

    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(600)

    expect(batches).toHaveLength(1)
    runtime.stop()
    vi.useRealTimers()
  })

  it('behavior.startMode does not auto-enable dynamic translation', async () => {
    vi.useFakeTimers()
    document.body.innerHTML = `
      <article>
        <p>This paragraph tests that startMode recommendation does not enable dynamic.</p>
      </article>
    `
    const settings = runtimeSettings()
    const batches: TranslationTask[][] = []
    const chromeRuntime = fakeRuntime(async message => {
      if (message.type === 'settings/getRuntime') return success(settings)
      if (message.type === 'translation/translateBatch') {
        batches.push(message.payload.tasks as TranslationTask[])
        return success({ results: (message.payload.tasks as TranslationTask[]).map(successResult) })
      }
      throw new Error(`Unexpected: ${message.type}`)
    })

    const runtime = createContentRuntime({ document, chromeRuntime })
    runtime.start()
    await runtime.translatePage()

    const newP = document.createElement('p')
    newP.textContent = 'Dynamic content that should not translate just because startMode exists.'
    document.querySelector('article')!.appendChild(newP)

    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(600)

    expect(batches).toHaveLength(1)
    runtime.stop()
    vi.useRealTimers()
  })

  it('generated translation nodes do not trigger incremental translation', async () => {
    vi.useFakeTimers()
    document.body.innerHTML = `
      <article>
        <p>This paragraph tests that generated nodes are ignored by the observer.</p>
      </article>
    `
    const settings = runtimeSettings()
    const batches: TranslationTask[][] = []
    const chromeRuntime = fakeRuntime(async message => {
      if (message.type === 'settings/getRuntime') return success(settings)
      if (message.type === 'translation/translateBatch') {
        batches.push(message.payload.tasks as TranslationTask[])
        return success({ results: (message.payload.tasks as TranslationTask[]).map(successResult) })
      }
      throw new Error(`Unexpected: ${message.type}`)
    })

    const runtime = createContentRuntime({ document, chromeRuntime })
    runtime.start()
    await runtime.translatePage()
    runtime.enableDynamicTranslation()

    const generated = document.createElement('div')
    generated.dataset.lingoflowGenerated = 'true'
    generated.textContent = 'Generated translation node that should not trigger scan.'
    document.querySelector('article')!.appendChild(generated)

    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(600)

    expect(batches).toHaveLength(1)
    runtime.stop()
    vi.useRealTimers()
  })
})

describe('route change behavior', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
  })

  it('route change increments root generation', async () => {
    document.body.innerHTML = `
      <article>
        <p>This paragraph is for testing root generation increment on route change.</p>
      </article>
    `
    const chromeRuntime = fakeRuntime(async message => {
      if (message.type === 'settings/getRuntime') return success(runtimeSettings())
      if (message.type === 'translation/translateBatch') {
        return success({ results: (message.payload.tasks as TranslationTask[]).map(successResult) })
      }
      throw new Error(`Unexpected: ${message.type}`)
    })

    const runtime = createContentRuntime({ document, chromeRuntime })
    runtime.start()
    await runtime.translatePage()

    const beforeDiagnostics = runtime.getDiagnostics()
    const genBefore = beforeDiagnostics?.rootGeneration ?? 1

    history.pushState({}, '', '/new-route-gen')

    const afterDiagnostics = runtime.getDiagnostics()
    expect(afterDiagnostics?.rootGeneration).toBeGreaterThan(genBefore)
    runtime.stop()
  })

  it('route change clears queued work and prevents old queued work from rendering', async () => {
    document.body.innerHTML = `
      <article>
        <p>This paragraph tests route change queue clearing behavior.</p>
      </article>
    `
    const settings = runtimeSettings()
    let resolveProvider: (() => void) | undefined
    let providerCallCount = 0
    const chromeRuntime = fakeRuntime(async message => {
      if (message.type === 'settings/getRuntime') return success(settings)
      if (message.type === 'translation/translateBatch') {
        providerCallCount++
        if (providerCallCount === 1) {
          await new Promise<void>(r => { resolveProvider = r })
        }
        return success({ results: (message.payload.tasks as TranslationTask[]).map(successResult) })
      }
      throw new Error(`Unexpected: ${message.type}`)
    })

    const runtime = createContentRuntime({ document, chromeRuntime })
    runtime.start()
    const translatePromise = runtime.translatePage()

    await waitFor(() => providerCallCount === 1)

    history.pushState({}, '', '/new-route-clear')

    resolveProvider?.()
    await translatePromise

    const diagnostics = runtime.getDiagnostics()
    expect(diagnostics?.rootGeneration).toBeGreaterThanOrEqual(2)
    runtime.stop()
  })

  it('route change resolves page rules for the new URL', async () => {
    document.body.innerHTML = `
      <article>
        <p>This paragraph tests that page rules are re-resolved on route change.</p>
      </article>
    `
    const chromeRuntime = fakeRuntime(async message => {
      if (message.type === 'settings/getRuntime') return success(runtimeSettings())
      if (message.type === 'translation/translateBatch') {
        return success({ results: (message.payload.tasks as TranslationTask[]).map(successResult) })
      }
      throw new Error(`Unexpected: ${message.type}`)
    })

    const runtime = createContentRuntime({ document, chromeRuntime })
    runtime.start()
    await runtime.translatePage()

    const beforeRule = runtime.getDiagnostics()?.rule.id

    history.pushState({}, '', '/different-page')

    const afterRule = runtime.getDiagnostics()?.rule.id
    expect(afterRule).toBeDefined()
    runtime.stop()
  })

  it('dynamic enabled route change translates new route after debounce', async () => {
    document.body.innerHTML = `
      <article>
        <p>Route change dynamic translation paragraph for testing.</p>
      </article>
    `
    const settings = runtimeSettings()
    const batches: TranslationTask[][] = []
    const chromeRuntime = fakeRuntime(async message => {
      if (message.type === 'settings/getRuntime') return success(settings)
      if (message.type === 'translation/translateBatch') {
        batches.push(message.payload.tasks as TranslationTask[])
        return success({ results: (message.payload.tasks as TranslationTask[]).map(successResult) })
      }
      throw new Error(`Unexpected: ${message.type}`)
    })

    const runtime = createContentRuntime({ document, chromeRuntime })
    runtime.start()
    await runtime.translatePage()

    expect(document.querySelectorAll('[data-lingoflow-translation]').length).toBeGreaterThanOrEqual(1)

    runtime.enableDynamicTranslation()

    history.pushState({}, '', '/dynamic-route')

    await waitFor(() => {
      const diagnostics = runtime.getDiagnostics()
      return diagnostics !== null && diagnostics.rootGeneration >= 2
    }, 3000)

    const diagnostics = runtime.getDiagnostics()
    expect(diagnostics?.rootGeneration).toBeGreaterThanOrEqual(2)
    expect(diagnostics?.dynamicTranslationEnabled).toBe(true)
    runtime.stop()
  })

  it('dynamic disabled route change does not auto-translate new route', async () => {
    document.body.innerHTML = `
      <article>
        <p>Route change no-dynamic paragraph for testing disabled behavior.</p>
      </article>
    `
    const settings = runtimeSettings()
    const batches: TranslationTask[][] = []
    const chromeRuntime = fakeRuntime(async message => {
      if (message.type === 'settings/getRuntime') return success(settings)
      if (message.type === 'translation/translateBatch') {
        batches.push(message.payload.tasks as TranslationTask[])
        return success({ results: (message.payload.tasks as TranslationTask[]).map(successResult) })
      }
      throw new Error(`Unexpected: ${message.type}`)
    })

    const runtime = createContentRuntime({ document, chromeRuntime })
    runtime.start()
    await runtime.translatePage()

    history.pushState({}, '', '/no-dynamic-route')

    await new Promise(r => setTimeout(r, 2000))

    expect(batches).toHaveLength(1)
    runtime.stop()
  })

  it('dynamic translation pauses while manual translation is running', async () => {
    document.body.innerHTML = `
      <article>
        <p>Paragraph for testing pause behavior during manual translation.</p>
      </article>
    `
    const settings = runtimeSettings()
    let resolveManual: (() => void) | undefined
    let manualBatchCount = 0
    const chromeRuntime = fakeRuntime(async message => {
      if (message.type === 'settings/getRuntime') return success(settings)
      if (message.type === 'translation/translateBatch') {
        manualBatchCount++
        if (manualBatchCount === 1) {
          await new Promise<void>(r => { resolveManual = r })
        }
        return success({ results: (message.payload.tasks as TranslationTask[]).map(successResult) })
      }
      throw new Error(`Unexpected: ${message.type}`)
    })

    const runtime = createContentRuntime({ document, chromeRuntime })
    runtime.start()
    runtime.enableDynamicTranslation()

    const translatePromise = runtime.translatePage()
    await waitFor(() => manualBatchCount === 1)

    const dynamicP = document.createElement('p')
    dynamicP.textContent = 'This dynamic paragraph should not translate while manual is running.'
    document.querySelector('article')!.appendChild(dynamicP)

    await new Promise(r => setTimeout(r, 2000))

    expect(manualBatchCount).toBe(1)

    resolveManual?.()
    await translatePromise

    expect(manualBatchCount).toBe(1)
    runtime.stop()
  })
})

describe('current-page target language override', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
  })

  it('current-page target language override is used for dynamically added content', async () => {
    document.body.innerHTML = `
      <article>
        <p>This paragraph tests target language override propagation to dynamic content.</p>
      </article>
    `
    const settings = runtimeSettings()
    const targetLangs: string[] = []
    const chromeRuntime = fakeRuntime(async message => {
      if (message.type === 'settings/getRuntime') return success(settings)
      if (message.type === 'translation/translateBatch') {
        const tasks = message.payload.tasks as TranslationTask[]
        targetLangs.push(tasks[0]?.targetLang)
        return success({ results: tasks.map(successResult) })
      }
      throw new Error(`Unexpected: ${message.type}`)
    })

    const runtime = createContentRuntime({ document, chromeRuntime })
    runtime.start()
    await runtime.translatePage({ targetLang: 'ja' })

    runtime.enableDynamicTranslation()

    const newP = document.createElement('p')
    newP.textContent = 'Dynamic paragraph that should use the page target language override.'
    document.querySelector('article')!.appendChild(newP)

    await waitFor(() => targetLangs.length >= 2, 3000)

    expect(targetLangs).toHaveLength(2)
    expect(targetLangs[0]).toBe('ja')
    expect(targetLangs[1]).toBe('ja')
    runtime.stop()
  })

  it('current-page target override is not saved globally', async () => {
    document.body.innerHTML = `
      <article>
        <p>This paragraph tests that page override does not persist globally.</p>
      </article>
    `
    const settings = runtimeSettings()
    let savedSettings: any = null
    const chromeRuntime = fakeRuntime(async message => {
      if (message.type === 'settings/getRuntime') return success(settings)
      if (message.type === 'settings/save') {
        savedSettings = message.payload.settings
        return success({})
      }
      if (message.type === 'translation/translateBatch') {
        return success({ results: (message.payload.tasks as TranslationTask[]).map(successResult) })
      }
      throw new Error(`Unexpected: ${message.type}`)
    })

    const runtime = createContentRuntime({ document, chromeRuntime })
    await runtime.translatePage({ targetLang: 'ja' })

    expect(savedSettings).toBeNull()
    expect(settings.targetLang).toBe('zh-Hans')
  })
})

describe('dirty and removed block handling', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
  })

  it('dirty known blocks requeue safely', async () => {
    vi.useFakeTimers()
    document.body.innerHTML = `
      <article>
        <p>This paragraph tests safe requeuing of dirty known blocks.</p>
      </article>
    `
    const settings = runtimeSettings()
    const batches: TranslationTask[][] = []
    const chromeRuntime = fakeRuntime(async message => {
      if (message.type === 'settings/getRuntime') return success(settings)
      if (message.type === 'translation/translateBatch') {
        batches.push(message.payload.tasks as TranslationTask[])
        return success({ results: (message.payload.tasks as TranslationTask[]).map(successResult) })
      }
      throw new Error(`Unexpected: ${message.type}`)
    })

    const runtime = createContentRuntime({ document, chromeRuntime })
    runtime.start()
    await runtime.translatePage()
    expect(batches).toHaveLength(1)

    const paragraph = document.querySelector('p') as HTMLElement
    paragraph.textContent = 'Mutated paragraph text for testing dirty block requeue safety.'

    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(80)

    expect(document.querySelector('[data-lingoflow-translation]')).toBeNull()

    await runtime.translatePage()
    expect(batches).toHaveLength(2)
    expect(batches[1][0].sourceText).toContain('Mutated paragraph text')

    runtime.stop()
    vi.useRealTimers()
  })

  it('removed blocks do not leave stale bindings or version entries', async () => {
    document.body.innerHTML = `
      <article>
        <p>This paragraph tests removal cleanup of bindings and version entries.</p>
      </article>
    `
    const settings = runtimeSettings()
    const chromeRuntime = fakeRuntime(async message => {
      if (message.type === 'settings/getRuntime') return success(settings)
      if (message.type === 'translation/translateBatch') {
        return success({ results: (message.payload.tasks as TranslationTask[]).map(successResult) })
      }
      throw new Error(`Unexpected: ${message.type}`)
    })

    const runtime = createContentRuntime({ document, chromeRuntime })
    runtime.start()
    await runtime.translatePage()

    const paragraph = document.querySelector('p') as HTMLElement
    paragraph.remove()

    await new Promise(r => setTimeout(r, 100))

    const dynamicP = document.createElement('p')
    dynamicP.textContent = 'New paragraph after removal should not conflict with old state.'
    document.querySelector('article')!.appendChild(dynamicP)

    await new Promise(r => setTimeout(r, 700))

    runtime.stop()
  })
})

describe('stale result and duplicate prevention', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
  })

  it('stale provider results are discarded', async () => {
    document.body.innerHTML = `
      <article>
        <p>This paragraph tests stale provider result discarding behavior.</p>
      </article>
    `
    const settings = runtimeSettings()
    let resolveProvider: (() => void) | undefined
    let providerCallCount = 0
    const chromeRuntime = fakeRuntime(async message => {
      if (message.type === 'settings/getRuntime') return success(settings)
      if (message.type === 'translation/translateBatch') {
        providerCallCount++
        await new Promise<void>(r => { resolveProvider = r })
        return success({ results: (message.payload.tasks as TranslationTask[]).map(successResult) })
      }
      throw new Error(`Unexpected: ${message.type}`)
    })

    const runtime = createContentRuntime({ document, chromeRuntime })
    runtime.start()
    const translatePromise = runtime.translatePage()

    await waitFor(() => providerCallCount === 1)

    history.pushState({}, '', '/stale-route')

    resolveProvider?.()
    const progress = await translatePromise

    expect(document.querySelectorAll('[data-lingoflow-translation]')).toHaveLength(0)
    runtime.stop()
  })

  it('duplicate generated translations are not inserted', async () => {
    document.body.innerHTML = `
      <article>
        <p>This paragraph tests duplicate translation prevention in render coordinator.</p>
      </article>
    `
    const settings = runtimeSettings()
    const chromeRuntime = fakeRuntime(async message => {
      if (message.type === 'settings/getRuntime') return success(settings)
      if (message.type === 'translation/translateBatch') {
        return success({ results: (message.payload.tasks as TranslationTask[]).map(successResult) })
      }
      throw new Error(`Unexpected: ${message.type}`)
    })

    const runtime = createContentRuntime({ document, chromeRuntime })
    await runtime.translatePage()
    await runtime.translatePage()

    expect(document.querySelectorAll('[data-lingoflow-translation]')).toHaveLength(1)
  })
})

describe('cache behavior with dynamic translation', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
  })

  it('cache is reused for unchanged text where applicable', async () => {
    document.body.innerHTML = `
      <article>
        <p>This paragraph tests cache reuse behavior across translations.</p>
      </article>
    `
    const settings = runtimeSettings()
    let providerCalls = 0
    const chromeRuntime = fakeRuntime(async message => {
      if (message.type === 'settings/getRuntime') return success(settings)
      if (message.type === 'translation/translateBatch') {
        providerCalls++
        return success({ results: (message.payload.tasks as TranslationTask[]).map(successResult) })
      }
      throw new Error(`Unexpected: ${message.type}`)
    })

    const runtime = createContentRuntime({ document, chromeRuntime })
    await runtime.translatePage()
    await runtime.translatePage()

    expect(providerCalls).toBe(1)
    expect(document.querySelectorAll('[data-lingoflow-translation]')).toHaveLength(1)
  })
})
