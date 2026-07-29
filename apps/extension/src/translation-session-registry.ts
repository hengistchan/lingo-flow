const DEFAULT_CANCELLED_SESSION_TTL_MS = 30 * 60 * 1000

type ActiveTranslationSession = {
  controller: AbortController
  activeBatches: number
}

export class TranslationSessionRegistry {
  private readonly activeSessions = new Map<string, ActiveTranslationSession>()
  private readonly cancelledSessions = new Map<string, number>()

  constructor(
    private readonly cancelledSessionTtlMs = DEFAULT_CANCELLED_SESSION_TTL_MS,
    private readonly now: () => number = Date.now,
  ) {}

  async run<T>(
    tabId: number | undefined,
    sessionId: string | undefined,
    operation: (signal?: AbortSignal) => Promise<T>,
  ): Promise<T> {
    if (!sessionId) return operation()

    this.pruneCancelledSessions()
    const key = sessionKey(tabId, sessionId)
    if (this.cancelledSessions.has(key)) {
      throw translationSessionCancelledError()
    }

    let session = this.activeSessions.get(key)
    if (!session) {
      session = {
        controller: new AbortController(),
        activeBatches: 0,
      }
      this.activeSessions.set(key, session)
    }

    session.activeBatches += 1
    try {
      return await operation(session.controller.signal)
    } finally {
      session.activeBatches -= 1
      if (
        session.activeBatches === 0 &&
        this.activeSessions.get(key) === session
      ) {
        this.activeSessions.delete(key)
      }
    }
  }

  cancel(tabId: number | undefined, sessionId: string): { abortedActiveBatches: boolean } {
    this.pruneCancelledSessions()
    const key = sessionKey(tabId, sessionId)
    this.cancelledSessions.set(key, this.now())

    const session = this.activeSessions.get(key)
    if (!session) return { abortedActiveBatches: false }

    session.controller.abort(translationSessionCancelledError())
    this.activeSessions.delete(key)
    return { abortedActiveBatches: true }
  }

  private pruneCancelledSessions(): void {
    const cutoff = this.now() - this.cancelledSessionTtlMs
    for (const [key, cancelledAt] of this.cancelledSessions) {
      if (cancelledAt < cutoff) this.cancelledSessions.delete(key)
    }
  }
}

export function translationSessionCancelledError(): Error & { code: string } {
  const error = new Error('Translation session cancelled') as Error & { code: string }
  error.name = 'AbortError'
  error.code = 'translation_session_cancelled'
  return error
}

function sessionKey(tabId: number | undefined, sessionId: string): string {
  return `${tabId ?? 'extension'}:${sessionId}`
}
