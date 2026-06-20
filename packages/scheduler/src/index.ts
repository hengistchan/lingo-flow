import type { DegradeReason, TranslationResult, TranslationTask } from '@lingoflow/types'

export type BatchOptions = {
  maxItems: number
  maxChars: number
}

export type RetryOptions = {
  attempts: number
  delayMs: number
}

export function createBatches(tasks: TranslationTask[], options: BatchOptions): TranslationTask[][] {
  const batches: TranslationTask[][] = []
  let current: TranslationTask[] = []
  let currentChars = 0

  for (const task of tasks) {
    const taskChars = task.sourceText.length
    const wouldExceedItems = current.length >= options.maxItems
    const wouldExceedChars = current.length > 0 && currentChars + taskChars > options.maxChars

    if (wouldExceedItems || wouldExceedChars) {
      batches.push(current)
      current = []
      currentChars = 0
    }

    current.push(task)
    currentChars += taskChars
  }

  if (current.length > 0) batches.push(current)
  return batches
}

export async function retry<T>(operation: () => Promise<T>, options: RetryOptions): Promise<T> {
  let lastError: unknown

  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      if (attempt >= options.attempts || !isRetryableProviderError(error)) break
      const backoffMs = Math.min(options.delayMs * Math.pow(2, attempt - 1), 10000)
      if (backoffMs > 0) await sleep(backoffMs)
    }
  }

  throw lastError
}

export async function translateBatchWithDegrade(
  tasks: TranslationTask[],
  translateBatch: (tasks: TranslationTask[]) => Promise<TranslationResult[]>,
): Promise<TranslationResult[]> {
  try {
    return await translateBatch(tasks)
  } catch (error) {
    if (tasks.length === 1) {
      const task = tasks[0]
      return [
        {
          taskId: task.id,
          blockId: task.blockId,
          sourceText: task.sourceText,
          sourceLang: task.sourceLang,
          targetLang: task.targetLang,
          providerId: task.providerId,
          model: task.model,
          promptVersion: task.promptVersion,
          cacheKey: task.cacheKey,
          fromCache: false,
          status: 'failed',
          error: normalizeError(error),
        },
      ]
    }

    const mid = Math.ceil(tasks.length / 2)
    const left = await translateBatchWithDegrade(tasks.slice(0, mid), translateBatch)
    const right = await translateBatchWithDegrade(tasks.slice(mid), translateBatch)
    return [...left, ...right]
  }
}

export function isRetryableProviderError(error: unknown): boolean {
  const status = getStatus(error)
  if (status === 429 || (status >= 500 && status <= 599)) return true

  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  return message.includes('timeout') || message.includes('network') || message.includes('failed to fetch')
}

export function isFallbackEligible(error: unknown): boolean {
  const status = getStatus(error)
  if (status === 401 || status === 403) return false
  if (status === 429 || (status >= 500 && status <= 599)) return true

  const code = getCode(error)
  if (code === 'provider_config_invalid') return false

  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  return (
    code === 'provider_invalid_output' ||
    message.includes('timeout') ||
    message.includes('network') ||
    message.includes('failed to fetch')
  )
}

export function normalizeError(error: unknown): { message: string; reason?: DegradeReason } {
  const message = error instanceof Error ? error.message : String(error)
  const status = getStatus(error)
  const code = getCode(error)

  if (status === 401 || status === 403) return { message, reason: 'provider_auth_failed' }
  if (status === 429) return { message, reason: 'provider_rate_limited' }
  if (status >= 500) return { message, reason: 'provider_network_error' }
  if (code === 'provider_invalid_output') return { message, reason: 'provider_invalid_output' }
  if (code === 'provider_config_invalid') return { message, reason: 'provider_config_invalid' }
  if (message.toLowerCase().includes('timeout')) return { message, reason: 'provider_timeout' }
  if (message.toLowerCase().includes('network')) return { message, reason: 'provider_network_error' }

  return { message }
}

function getStatus(error: unknown): number {
  return typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number'
    ? error.status
    : 0
}

function getCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
