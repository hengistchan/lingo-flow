# 03. Cache Design

## Goal

Translation cache reduces provider cost and improves repeated-page performance.

Core principle:

> Same source text under the same target language, provider, model, prompt version, and normalization version should be translated once.

## Cache Layers

```txt
Content Runtime Memory Cache
  short-lived
  page-scoped
  prevents duplicate requests in one translation session

Background IndexedDB Cache
  persistent
  extension-scoped
  survives page refresh and browser restart
```

## Responsibility Split

Content runtime:

- Generates TextBlock
- Generates TranslationTask
- Resolves memory cache
- Sends cache resolve request to background
- Renders hits

Background:

- Owns IndexedDB
- Resolves persistent cache
- Saves provider results
- Cleans cache

## Cache Key

Never use text hash alone.

```ts
export type CacheKeyInput = {
  textHash: string
  sourceLang: string
  targetLang: string
  providerId: string
  model?: string
  promptVersion?: string
  normalizeVersion: string
}
```

```ts
export function buildTranslationCacheKey(input: CacheKeyInput): string {
  return [
    'translation',
    input.textHash,
    input.sourceLang,
    input.targetLang,
    input.providerId,
    input.model ?? 'default',
    input.promptVersion ?? 'none',
    input.normalizeVersion,
  ].join(':')
}
```

Example:

```txt
translation:8f3a91:en:zh-Hans:azure-translator:default:none:v1
translation:8f3a91:en:zh-Hans:openai-compatible:gpt-4o-mini:prompt-v1:v1
```

## Text Normalization

```ts
export const NORMALIZE_VERSION = 'v1'

export function normalizeText(text: string): string {
  return text
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
```

## SHA-256 Hash

```ts
export async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)

  return Array.from(new Uint8Array(hashBuffer))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}
```

## IndexedDB Schema

Use Dexie if possible.

```ts
import Dexie, { type Table } from 'dexie'

export type CachedTranslation = {
  cacheKey: string

  sourceText: string
  normalizedText: string
  translatedText: string

  sourceLang: string
  targetLang: string

  providerId: string
  model?: string
  promptVersion?: string
  normalizeVersion: string

  pageUrl?: string
  domain?: string

  createdAt: number
  updatedAt: number
  lastUsedAt: number
  hitCount: number

  sourceTextLength: number
  translatedTextLength: number
}

export class LingoFlowDB extends Dexie {
  translations!: Table<CachedTranslation, string>

  constructor() {
    super('lingoflow-db')

    this.version(1).stores({
      translations:
        '&cacheKey, providerId, targetLang, domain, updatedAt, lastUsedAt',
    })
  }
}

export const db = new LingoFlowDB()
```

## Cache Resolve

```ts
export async function resolveTranslationCache(tasks: TranslationTask[]) {
  try {
    const cachedItems = await db.translations.bulkGet(
      tasks.map(task => task.cacheKey)
    )

    const hits: TranslationResult[] = []
    const misses: TranslationTask[] = []

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i]
      const cached = cachedItems[i]

      if (cached) {
        hits.push({
          taskId: task.id,
          blockId: task.blockId,
          sourceText: task.sourceText,
          translatedText: cached.translatedText,
          sourceLang: cached.sourceLang,
          targetLang: cached.targetLang,
          providerId: cached.providerId,
          model: cached.model,
          cacheKey: task.cacheKey,
          fromCache: true,
          status: 'success',
        })
      } else {
        misses.push(task)
      }
    }

    await markCacheHits(hits.map(hit => hit.cacheKey))

    return { hits, misses }
  } catch (error) {
    return {
      hits: [],
      misses: tasks,
      degraded: true,
      reason: 'cache_read_failed',
    }
  }
}
```

## Cache Save

Cache write failure must not fail current page translation.

```ts
export async function safeSaveTranslationCache(input: {
  task: TranslationTask
  translatedText: string
}) {
  try {
    await saveTranslationCache(input)
  } catch (error) {
    console.warn('[LingoFlow] Cache write failed', error)
  }
}
```

## Cleanup

MVP supports:

- clear all cache
- clear cache by domain
- prune by max item count

```ts
export async function clearAllCache() {
  await db.translations.clear()
}

export async function clearCacheByDomain(domain: string) {
  await db.translations.where('domain').equals(domain).delete()
}

export async function pruneCache(maxItems = 50000) {
  const count = await db.translations.count()
  if (count <= maxItems) return

  const overflow = count - maxItems

  const oldItems = await db.translations
    .orderBy('lastUsedAt')
    .limit(overflow)
    .toArray()

  await db.translations.bulkDelete(oldItems.map(item => item.cacheKey))
}
```

## Acceptance

- Same page refresh hits cache.
- Switching provider misses old cache.
- Switching model misses old cache.
- Switching target language misses old cache.
- Cache read failure falls back to provider.
- Cache write failure does not block rendering.
