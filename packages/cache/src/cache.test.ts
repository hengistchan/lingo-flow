import type { TranslationTask } from '@lingoflow/types'
import {
  resolveTranslationCache,
  safeSaveTranslationCache,
} from './index'

const task: TranslationTask = {
  id: 'task_1',
  blockId: 'block_1',
  sourceText: 'A readable paragraph for cache failure testing.',
  normalizedText: 'A readable paragraph for cache failure testing.',
  textHash: 'hash_1',
  sourceLang: 'en',
  targetLang: 'zh-Hans',
  providerId: 'openai-compatible',
  model: 'test-model',
  promptVersion: 'prompt-v1',
  normalizeVersion: 'v1',
  cacheKey: 'translation:hash_1:en:zh-Hans:openai-compatible:test-model:prompt-v1:v1',
  pageUrl: 'https://example.com/article',
  domain: 'example.com',
}

describe('translation cache failure handling', () => {
  it('degrades a cache read failure to provider misses', async () => {
    await expect(resolveTranslationCache([task])).resolves.toEqual({
      hits: [],
      misses: [task],
      degraded: true,
      reason: 'cache_read_failed',
    })
  })

  it('does not reject when a cache write fails', async () => {
    await expect(
      safeSaveTranslationCache({ task, translatedText: '缓存写入失败也应继续显示。' }),
    ).resolves.toBeUndefined()
  })
})
