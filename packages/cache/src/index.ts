import Dexie, { type Table } from 'dexie'
import type { CachedTranslation, CacheKeyInput, TranslationResult, TranslationTask } from '@lingoflow/types'

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

export class LingoFlowDB extends Dexie {
  translations!: Table<CachedTranslation, string>

  constructor() {
    super('lingoflow-db')

    this.version(1).stores({
      translations: '&cacheKey, providerId, targetLang, domain, updatedAt, lastUsedAt',
    })
  }
}

let db: LingoFlowDB | undefined

export function getLingoFlowDB(): LingoFlowDB {
  db ??= new LingoFlowDB()
  return db
}

export async function resolveTranslationCache(tasks: TranslationTask[]) {
  try {
    const database = getLingoFlowDB()
    const cachedItems = await database.translations.bulkGet(tasks.map(task => task.cacheKey))
    const hits: TranslationResult[] = []
    const misses: TranslationTask[] = []

    for (let index = 0; index < tasks.length; index += 1) {
      const task = tasks[index]
      const cached = cachedItems[index]

      if (!cached) {
        misses.push(task)
        continue
      }

      hits.push({
        taskId: task.id,
        blockId: task.blockId,
        sourceText: task.sourceText,
        translatedText: cached.translatedText,
        sourceLang: cached.sourceLang,
        targetLang: cached.targetLang,
        providerId: cached.providerId,
        model: cached.model,
        promptVersion: cached.promptVersion,
        cacheKey: task.cacheKey,
        fromCache: true,
        status: 'success',
      })
    }

    await markCacheHits(hits.map(hit => hit.cacheKey))

    return { hits, misses, degraded: false as const }
  } catch (error) {
    console.warn('[LingoFlow] Cache read failed', error)
    return {
      hits: [],
      misses: tasks,
      degraded: true as const,
      reason: 'cache_read_failed' as const,
    }
  }
}

export async function saveTranslationCache(input: { task: TranslationTask; translatedText: string }) {
  const now = Date.now()
  const item: CachedTranslation = {
    cacheKey: input.task.cacheKey,
    sourceText: input.task.sourceText,
    normalizedText: input.task.normalizedText,
    translatedText: input.translatedText,
    sourceLang: input.task.sourceLang,
    targetLang: input.task.targetLang,
    providerId: input.task.providerId,
    model: input.task.model,
    promptVersion: input.task.promptVersion,
    normalizeVersion: input.task.normalizeVersion ?? 'v1',
    pageUrl: input.task.pageUrl,
    domain: input.task.domain,
    createdAt: now,
    updatedAt: now,
    lastUsedAt: now,
    hitCount: 0,
    sourceTextLength: input.task.sourceText.length,
    translatedTextLength: input.translatedText.length,
  }

  await getLingoFlowDB().translations.put(item)
}

export async function safeSaveTranslationCache(input: { task: TranslationTask; translatedText: string }) {
  try {
    await saveTranslationCache(input)
  } catch (error) {
    console.warn('[LingoFlow] Cache write failed', error)
  }
}

export async function markCacheHits(cacheKeys: string[]) {
  if (cacheKeys.length === 0) return

  try {
    const database = getLingoFlowDB()
    const now = Date.now()

    await database.transaction('rw', database.translations, async () => {
      await database.translations
        .where("cacheKey")
        .anyOf(cacheKeys)
        .modify(function (item) {
          item.hitCount = (item.hitCount || 0) + 1
          item.lastUsedAt = now
        })
    })
  } catch (error) {
    console.warn('[LingoFlow] Cache mark hits failed', error)
  }
}

export async function clearAllCache() {
  try {
    await getLingoFlowDB().translations.clear()
  } catch (error) {
    console.warn('[LingoFlow] Cache clear all failed', error)
  }
}

export async function clearCacheByDomain(domain: string) {
  try {
    await getLingoFlowDB().translations.where('domain').equals(domain).delete()
  } catch (error) {
    console.warn('[LingoFlow] Cache clear domain failed', error)
  }
}

export async function pruneCache(maxItems = 50000) {
  try {
    const database = getLingoFlowDB()
    const count = await database.translations.count()
    if (count <= maxItems) return

    const overflow = count - maxItems
    const oldItems = await database.translations.orderBy('lastUsedAt').limit(overflow).toArray()
    await database.translations.bulkDelete(oldItems.map(item => item.cacheKey))
  } catch (error) {
    console.warn('[LingoFlow] Cache prune failed', error)
  }
}
