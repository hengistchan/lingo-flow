import type { TranslationTask } from '@lingoflow/types'
import {
  resolveTranslationCache,
  safeSaveTranslationCache,
  markCacheHits,
  pruneCache,
  clearAllCache,
  clearCacheByDomain,
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
  meta: {
    url: 'https://example.com/article',
    domain: 'example.com',
    ruleId: 'test-rule',
    runId: 'run_cache_test',
    rootGeneration: 1,
  },
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

describe("markCacheHits", () => {
  it("Resolves without error for an empty array", async () => {
    await expect(markCacheHits([])).resolves.toBeUndefined()
  })

  it("Handles gracefully when IndexedDB is unavailable", async () => {
    await expect(markCacheHits(["nonexistent-key"])).resolves.toBeUndefined()
  })
})

describe("pruneCache", () => {
  it("Handles gracefully when IndexedDB is unavailable", async () => {
    await expect(pruneCache(10)).resolves.toBeUndefined()
  })
})

describe("clearAllCache", () => {
  it("Resolves without error even when IndexedDB is unavailable", async () => {
    await expect(clearAllCache()).resolves.toBeUndefined()
  })
})

describe("clearCacheByDomain", () => {
  it("Resolves without error even when IndexedDB is unavailable", async () => {
    await expect(clearCacheByDomain("example.com")).resolves.toBeUndefined()
  })
})
