import { VersionTracker } from './version'

describe('VersionTracker', () => {
  it('begins a run and returns run id', () => {
    const tracker = new VersionTracker()

    const runId = tracker.beginRun()

    expect(runId).toMatch(/^run_/)
    expect(tracker.currentRunId()).toBe(runId)
  })

  it('increments revision on registerBlock', () => {
    const tracker = new VersionTracker()
    tracker.beginRun()

    const v1 = tracker.registerBlock('block_1', 'hash_1', 'sig_1')
    const v2 = tracker.registerBlock('block_1', 'hash_2', 'sig_2')

    expect(v1.revision).toBe(1)
    expect(v2.revision).toBe(2)
  })

  it('detects run-mismatch', () => {
    const tracker = new VersionTracker()
    const runId = tracker.beginRun()
    tracker.registerBlock('block_1', 'hash_1', 'sig_1')

    const result = tracker.checkStaleness('block_1', {
      runId: 'different_run',
      revision: 1,
      textHash: 'hash_1',
      sourceSignature: 'sig_1',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('run-mismatch')
  })

  it('detects revision-mismatch', () => {
    const tracker = new VersionTracker()
    const runId = tracker.beginRun()
    tracker.registerBlock('block_1', 'hash_1', 'sig_1')

    const result = tracker.checkStaleness('block_1', {
      runId,
      revision: 999,
      textHash: 'hash_1',
      sourceSignature: 'sig_1',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('revision-mismatch')
  })

  it('detects text-changed', () => {
    const tracker = new VersionTracker()
    const runId = tracker.beginRun()
    tracker.registerBlock('block_1', 'hash_old', 'sig_1')

    const result = tracker.checkStaleness('block_1', {
      runId,
      revision: 1,
      textHash: 'hash_new',
      sourceSignature: 'sig_1',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('text-changed')
  })

  it('detects source-signature-changed', () => {
    const tracker = new VersionTracker()
    const runId = tracker.beginRun()
    tracker.registerBlock('block_1', 'hash_1', 'sig_old')

    const result = tracker.checkStaleness('block_1', {
      runId,
      revision: 1,
      textHash: 'hash_1',
      sourceSignature: 'sig_new',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('source-signature-changed')
  })

  it('returns ok for matching version', () => {
    const tracker = new VersionTracker()
    const runId = tracker.beginRun()
    tracker.registerBlock('block_1', 'hash_1', 'sig_1')

    const result = tracker.checkStaleness('block_1', {
      runId,
      revision: 1,
      textHash: 'hash_1',
      sourceSignature: 'sig_1',
    })

    expect(result.ok).toBe(true)
  })

  it('returns ok: false with detached reason for unknown block', () => {
    const tracker = new VersionTracker()
    const runId = tracker.beginRun()

    const result = tracker.checkStaleness('unknown_block', {
      runId,
      revision: 1,
      textHash: 'hash_1',
      sourceSignature: 'sig_1',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('detached')
  })

  it('removes block tracking', () => {
    const tracker = new VersionTracker()
    const runId = tracker.beginRun()
    tracker.registerBlock('block_1', 'hash_1', 'sig_1')

    tracker.removeBlock('block_1')

    const result = tracker.checkStaleness('block_1', {
      runId,
      revision: 1,
      textHash: 'hash_1',
      sourceSignature: 'sig_1',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('detached')
  })

  it('bumps mutation sequence', () => {
    const tracker = new VersionTracker()

    expect(tracker.currentMutationSeq()).toBe(0)
    expect(tracker.nextMutationSeq()).toBe(1)
    expect(tracker.nextMutationSeq()).toBe(2)
    expect(tracker.currentMutationSeq()).toBe(2)
  })

  it('uses injected id factory for deterministic tests', () => {
    let counter = 0
    const tracker = new VersionTracker(() => `deterministic_${++counter}`)

    expect(tracker.beginRun()).toBe('deterministic_1')
    expect(tracker.beginRun()).toBe('deterministic_2')
  })
})
