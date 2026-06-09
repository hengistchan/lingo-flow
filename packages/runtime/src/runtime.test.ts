import { NORMALIZE_VERSION } from '@lingoflow/shared'
import type {
  MessageResponse,
  PublicRuntimeSettings,
  TranslationResult,
  TranslationTask,
} from '@lingoflow/types'
import { createContentRuntime, deriveProgressStatus } from './index'

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

  it('derives honest terminal states', () => {
    expect(deriveProgressStatus({ translated: 3, failed: 0, total: 3 })).toBe('done')
    expect(deriveProgressStatus({ translated: 2, failed: 1, total: 3 })).toBe('partial')
    expect(deriveProgressStatus({ translated: 0, failed: 3, total: 3 })).toBe('failed')
    expect(deriveProgressStatus({ translated: 0, failed: 0, total: 0 })).toBe('failed')
  })
})

function runtimeSettings(): PublicRuntimeSettings {
  return {
    sourceLang: 'auto',
    targetLang: 'zh-Hans',
    renderMode: 'below-original',
    cacheEnabled: false,
    maxCacheItems: 50000,
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
    sourceLang: task.sourceLang,
    targetLang: task.targetLang,
    providerId: task.providerId,
    cacheKey: task.cacheKey,
    fromCache: false,
    status: 'success',
  }
}
