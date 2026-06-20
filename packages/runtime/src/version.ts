import type { BlockVersion, StalenessResult } from '@lingoflow/types'

type VersionEntry = {
  revision: number
  textHash: string
  sourceSignature: string
}

export class VersionTracker {
  private currentRun: string = ''
  private mutationSeq = 0
  private readonly versions = new Map<string, VersionEntry>()
  private readonly idFactory: () => string

  constructor(idFactory?: () => string) {
    this.idFactory = idFactory ?? (() => `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`)
  }

  beginRun(): string {
    this.currentRun = this.idFactory()
    return this.currentRun
  }

  currentRunId(): string {
    return this.currentRun
  }

  registerBlock(blockId: string, textHash: string, sourceSignature: string): BlockVersion {
    const existing = this.versions.get(blockId)
    const revision = existing ? existing.revision + 1 : 1
    this.versions.set(blockId, { revision, textHash, sourceSignature })
    return {
      blockId,
      runId: this.currentRun,
      revision,
      textHash,
      sourceSignature,
      collectedAtMutationSeq: this.mutationSeq,
      rootGeneration: 1,
    }
  }

  checkStaleness(
    blockId: string,
    expected: {
      runId: string
      revision: number
      textHash: string
      sourceSignature: string
    },
  ): StalenessResult {
    if (expected.runId !== this.currentRun) {
      return { ok: false, reason: 'run-mismatch' }
    }

    const entry = this.versions.get(blockId)
    if (!entry) {
      return { ok: false, reason: 'detached' }
    }

    if (expected.revision !== entry.revision) {
      return { ok: false, reason: 'revision-mismatch' }
    }

    if (expected.textHash !== entry.textHash) {
      return { ok: false, reason: 'text-changed' }
    }

    if (expected.sourceSignature !== entry.sourceSignature) {
      return { ok: false, reason: 'source-signature-changed' }
    }

    return { ok: true }
  }

  removeBlock(blockId: string): void {
    this.versions.delete(blockId)
  }

  nextMutationSeq(): number {
    return ++this.mutationSeq
  }

  currentMutationSeq(): number {
    return this.mutationSeq
  }
}
