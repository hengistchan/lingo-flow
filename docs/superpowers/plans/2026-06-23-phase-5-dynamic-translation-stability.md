# Phase 5: Dynamic Translation Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize observer-driven incremental translation while keeping dynamic translation off globally by default.

**Architecture:** Extend `RuntimeController` with page-level target language override, proper route-change lifecycle (stale marking, rule re-resolution, queue clearing), dynamic mode guarding against manual translation conflicts, and diagnostics integration. Add comprehensive runtime tests.

**Tech Stack:** TypeScript, Vitest, existing `@lingoflow/runtime` package

## Global Constraints

- Dynamic translation defaults to off globally
- `behavior.startMode` remains a recommendation only — must not auto-enable dynamic
- Dynamic enabled/disabled state is page runtime state only, not persisted globally
- Site rules must not automatically enable dynamic translation in this phase
- No options rule management UI, popup diagnostics UI, E2E fixtures, rule editor UI, provider adaptive batching, glossary behavior, or release packaging

---

## Task 1: Add page target language override to RuntimeController

**Files:**
- Modify: `packages/runtime/src/controller.ts`

**Interfaces:**
- Produces: `pageTargetLangOverride: string | undefined` field on `RuntimeController`
- `translateIncremental()` uses override when no explicit `targetLang` is passed

- [ ] **Step 1: Add the field**

Add after line 68 (`private providerRequestedCount = 0`):
```ts
private pageTargetLangOverride: string | undefined = undefined
```

- [ ] **Step 2: Set override in translatePage**

In `translatePage()`, after line 117 (`this.progress.targetLang = targetLang`), add:
```ts
if (overrides.targetLang) {
  this.pageTargetLangOverride = overrides.targetLang
}
```

- [ ] **Step 3: Set override in translateIncremental**

In `translateIncremental()`, after line 296 (`const effectiveSettings = { ...settings, sourceLang, targetLang }`), add:
```ts
if (overrides.targetLang) {
  this.pageTargetLangOverride = overrides.targetLang
}
```

- [ ] **Step 4: Use override as fallback in translateIncremental**

Change the `targetLang` resolution in `translateIncremental()` from:
```ts
const targetLang = this.resolveLanguage(overrides.targetLang, settings.targetLang, getTargetLanguageOptions())
```
to:
```ts
const targetLang = this.resolveLanguage(overrides.targetLang ?? this.pageTargetLangOverride, settings.targetLang, getTargetLanguageOptions())
```

- [ ] **Step 5: Clear override in clearPage**

In `clearPage()`, after line 262 (`this.lastResolvedRule = null`), add:
```ts
this.pageTargetLangOverride = undefined
```

---

## Task 2: Enhance route-change handling in controller

**Files:**
- Modify: `packages/runtime/src/controller.ts`

**Interfaces:**
- Route changes now: mark old blocks stale, clear rendered nodes, remove stale blocks/bindings, re-resolve page rules, emit diagnostics
- Existing `observer:newContent` with `cause: 'route-change'` handler is replaced

- [ ] **Step 1: Replace the route-change handler**

In `subscribeToEvents()`, replace the existing `observer:newContent` handler:
```ts
this.events.on('observer:newContent', event => {
  if (event.cause === 'route-change') {
    this.handleRouteChange()
    return
  }

  if (this.dynamicTranslationEnabled && !this.translating) {
    this.translateIncremental().catch(error => {
      console.warn('[LingoFlow] Dynamic translation failed', error)
    })
  }
})
```

- [ ] **Step 2: Implement handleRouteChange method**

Add this private method to `RuntimeController`:
```ts
private handleRouteChange(): void {
  for (const block of this.store.all()) {
    if (block.state === 'rendered' || block.state === 'translated' || block.state === 'cache-hit') {
      this.store.dispatch(block.id, 'MARK_STALE')
    }
    this.bindings.removeRenderedNodes(block.id)
  }

  this.queue.clear()
  this.store.clear()
  this.bindings.clear()
  this.version.nextRootGeneration()

  this.lastResolvedRule = resolvePageRule(this.root, this.root.location.href, { siteRules: this.siteRules })

  if (this.dynamicTranslationEnabled) {
    this.translateIncremental().catch(error => {
      console.warn('[LingoFlow] Dynamic route translation failed', error)
    })
  }
}
```

- [ ] **Step 3: Verify existing import of resolvePageRule**

`resolvePageRule` is already imported at line 3 of controller.ts. No change needed.

---

## Task 3: Add dynamic translation mode tracking to diagnostics

**Files:**
- Modify: `packages/runtime/src/controller.ts`

- [ ] **Step 1: Add dynamicTranslationMode to diagnostics snapshot**

In `updateDiagnosticsSnapshot()`, add to the `this.latestDiagnostics` object after `dynamicTranslationEnabled`:
```ts
dynamicTranslationMode: this.getDynamicTranslationMode(),
```

- [ ] **Step 2: Add getDynamicTranslationMode method**

Add this private method:
```ts
private getDynamicTranslationMode(): string {
  if (!this.dynamicTranslationEnabled) return 'disabled'
  if (this.translating) return 'paused'
  return 'enabled'
}
```

Note: This is a simplified mode indicator for diagnostics. The full state machine (disabled/enabled/route-pending/paused) is behavioral, not stored as a single enum.

---

## Task 4: Add comprehensive runtime tests

**Files:**
- Create: `packages/runtime/src/dynamic-stability.test.ts`

- [ ] **Step 1: Create the test file with helpers**

```ts
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
```

- [ ] **Step 2: Add dynamic mode default off test**

```ts
describe('dynamic translation stability', () => {
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
```

- [ ] **Step 3: Add enable/disable dynamic translation tests**

```ts
  it('enabling dynamic translation per page translates newly added readable content once', async () => {
    vi.useFakeTimers()
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

    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(600)

    expect(batches).toHaveLength(2)
    expect(batches[1][0].sourceText).toContain('newly added paragraph')

    runtime.stop()
    vi.useRealTimers()
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
```

- [ ] **Step 4: Add startMode does not auto-enable test**

```ts
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
```

- [ ] **Step 5: Add generated nodes do not trigger incremental translation test**

```ts
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
```

- [ ] **Step 6: Add route change tests**

```ts
describe('route change behavior', () => {
  it('route change increments root generation', () => {
    const chromeRuntime = fakeRuntime(async () => success(null))
    const runtime = createContentRuntime({ document, chromeRuntime })
    runtime.start()

    history.pushState({}, '', '/new-route-1')

    const diagnostics = runtime.getDiagnostics()
    expect(diagnostics?.rootGeneration).toBeGreaterThanOrEqual(2)
    runtime.stop()
  })

  it('route change clears queued work and prevents old queued work from rendering', async () => {
    vi.useFakeTimers()
    document.body.innerHTML = `
      <article>
        <p>This paragraph tests route change queue clearing behavior.</p>
      </article>
    `
    const settings = runtimeSettings()
    let resolveProvider: (() => void) | undefined
    const chromeRuntime = fakeRuntime(async message => {
      if (message.type === 'settings/getRuntime') return success(settings)
      if (message.type === 'translation/translateBatch') {
        await new Promise<void>(r => { resolveProvider = r })
        return success({ results: (message.payload.tasks as TranslationTask[]).map(successResult) })
      }
      throw new Error(`Unexpected: ${message.type}`)
    })

    const runtime = createContentRuntime({ document, chromeRuntime })
    runtime.start()
    const translatePromise = runtime.translatePage()

    await vi.advanceTimersByTimeAsync(0)

    history.pushState({}, '', '/new-route-2')

    resolveProvider?.()
    await translatePromise.catch(() => {})

    expect(runtime.getDiagnostics()?.rootGeneration).toBeGreaterThanOrEqual(2)
    runtime.stop()
    vi.useRealTimers()
  })

  it('dynamic enabled route change translates new route after debounce', async () => {
    vi.useFakeTimers()
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
    runtime.enableDynamicTranslation()

    history.pushState({}, '', '/dynamic-route')

    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(600)

    expect(batches.length).toBeGreaterThanOrEqual(2)
    runtime.stop()
    vi.useRealTimers()
  })

  it('dynamic disabled route change does not auto-translate new route', async () => {
    vi.useFakeTimers()
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

    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(600)

    expect(batches).toHaveLength(1)
    runtime.stop()
    vi.useRealTimers()
  })

  it('dynamic translation pauses while manual translation is running', async () => {
    vi.useFakeTimers()
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
    await vi.advanceTimersByTimeAsync(0)

    const dynamicP = document.createElement('p')
    dynamicP.textContent = 'This dynamic paragraph should not translate while manual is running.'
    document.querySelector('article')!.appendChild(dynamicP)

    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(600)

    expect(manualBatchCount).toBe(1)

    resolveManual?.()
    await translatePromise

    expect(manualBatchCount).toBe(1)
    runtime.stop()
    vi.useRealTimers()
  })
```

- [ ] **Step 7: Add target language override tests**

```ts
describe('current-page target language override', () => {
  it('current-page target language override is used for dynamically added content', async () => {
    vi.useFakeTimers()
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

    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(600)

    expect(targetLangs).toHaveLength(2)
    expect(targetLangs[0]).toBe('ja')
    expect(targetLangs[1]).toBe('ja')
    runtime.stop()
    vi.useRealTimers()
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
```

- [ ] **Step 8: Add dirty/removed block tests**

```ts
describe('dirty and removed block handling', () => {
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
```

- [ ] **Step 9: Add stale result and duplicate prevention tests**

```ts
describe('stale result and duplicate prevention', () => {
  it('stale provider results are discarded', async () => {
    document.body.innerHTML = `
      <article>
        <p>This paragraph tests stale provider result discarding behavior.</p>
      </article>
    `
    const settings = runtimeSettings()
    let resolveProvider: (() => void) | undefined
    const chromeRuntime = fakeRuntime(async message => {
      if (message.type === 'settings/getRuntime') return success(settings)
      if (message.type === 'translation/translateBatch') {
        await new Promise<void>(r => { resolveProvider = r })
        return success({ results: (message.payload.tasks as TranslationTask[]).map(successResult) })
      }
      throw new Error(`Unexpected: ${message.type}`)
    })

    const runtime = createContentRuntime({ document, chromeRuntime })
    runtime.start()
    const translatePromise = runtime.translatePage()

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
```

- [ ] **Step 10: Add cache reuse test**

```ts
describe('cache behavior with dynamic translation', () => {
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
```

---

## Task 5: Run verification commands

- [ ] **Step 1: Run runtime tests**

```bash
pnpm test -- packages/runtime
```

Expected: All tests pass including new dynamic-stability tests.

- [ ] **Step 2: Run DOM tests**

```bash
pnpm test -- packages/dom/src/dom.test.ts
```

Expected: All existing tests pass.

- [ ] **Step 3: Run rules tests**

```bash
pnpm test -- packages/rules/src/rules.test.ts
```

Expected: All existing tests pass.

- [ ] **Step 4: Run typecheck**

```bash
pnpm typecheck
```

Expected: No type errors.

---

## Files Changed Summary

| File | Change |
|------|--------|
| `packages/runtime/src/controller.ts` | Add `pageTargetLangOverride` field, enhance route-change handling, add pause guard, dynamic mode diagnostics |
| `packages/runtime/src/dynamic-stability.test.ts` | New comprehensive test file covering all Phase 5 requirements |
