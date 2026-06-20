# Translation Runtime Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the one-shot LingoFlow page translation runtime with the full revision-aware page translation runtime described in `docs/superpowers/specs/2026-06-20-translation-runtime-redesign.md`.

**Architecture:** Keep the content runtime as the owner of page scanning, block state, DOM bindings, rendering, and in-memory cache. Split pure contracts into `packages/types`, DOM scanning into `packages/dom`, pure insertion strategies into `packages/renderer`, and orchestration into `packages/runtime`, with no `runtime <-> renderer` package cycle.

**Tech Stack:** TypeScript, Vitest, happy-dom, WXT MV3 content scripts, Chrome extension messaging, Playwright installed-extension E2E.

---

## Scope Check

This is a full implementation plan, not a staged rollout. Do not leave dynamic observation, revision checks, binding cleanup, render safety, or display modes as follow-up work.

The spec spans scanner, runtime, renderer, observer, and E2E, but these are one coupled subsystem: safe dynamic translation requires all of them to land together. The implementation is still split into commit-sized tasks so each part can be reviewed and tested independently.

## Dirty Worktree Guard

Before editing, run:

```bash
git status --short
```

At the time this plan was written, unrelated dirty files existed:

- `apps/extension/src/ui/LfLanguagePair.vue`
- `packages/shared/src/inline-tokens.test.ts`
- `packages/shared/src/inline-tokens.ts`
- `.superpowers/`
- `docs/superpowers/plans/2026-06-20-lingoflow-ui-redesign.md`
- `docs/superpowers/specs/2026-06-20-lingoflow-ui-redesign.md`
- `docs/superpowers/specs/2026-06-20-translation-runtime-redesign.md`

Do not revert or overwrite unrelated user changes. If a task must touch an already dirty file, inspect the diff first:

```bash
git diff -- packages/shared/src/inline-tokens.ts packages/shared/src/inline-tokens.test.ts
```

## File Structure

Create or modify these files.

### Contracts

- Modify: `packages/types/src/index.ts`
  - Add `TranslationBlock`, `BlockBinding`, `BlockBindingDraft`, `ScanResult`, `BlockState`, `BlockEvent`, `PageRunState`, `PageDisplayMode`, `RuntimeEvent`, `RenderSkipReason`, `StalenessResult`, `BlockVersion`, `QueuePriority`, `QueuedBatch`, `BatchLimits`, `ContentRootKind`, `MutationCause`, `PageAdapter`, `InsertionPlan`, and `InsertionResult`.
  - Preserve existing provider/cache/settings/message types.
  - Keep `TextBlock` as a compatibility alias or migration wrapper only if needed by untouched code during the rewrite.
- Create: `packages/types/src/runtime-contract.test.ts`
  - Type-level and runtime-shape tests for serializable blocks and DOM-free contracts.

### DOM Scanner

- Modify: `packages/dom/src/index.ts`
  - Export the new `collectScanResults()` public scanner API.
  - Keep `collectTextBlocks()` only as a backwards-compatible wrapper until runtime wiring is replaced.
- Create: `packages/dom/src/filters.ts`
  - UI exclusion, interactive density, table cell filtering, visibility, generated-node checks.
- Create: `packages/dom/src/content-root.ts`
  - Content root discovery and scoring.
- Create: `packages/dom/src/page-adapters.ts`
  - HTML, open Shadow DOM, and PDF text-layer adapter boundary.
- Create: `packages/dom/src/inline-tokenization.ts`
  - Request-text protection and inline token extraction if not kept in `packages/shared`.
- Modify: `packages/dom/src/dom.test.ts`
  - Expand scanner and filter tests.

### Renderer

- Modify: `packages/renderer/src/index.ts`
  - Export the public renderer helpers and compatibility API.
- Create: `packages/renderer/src/strategies.ts`
  - `LinebreakInsideStrategy`, `InlineInsideStrategy`, `InsideContainerStrategy`, `BeforeNestedStructureStrategy`, `AfterBlockStrategy`.
- Create: `packages/renderer/src/registry.ts`
  - Priority-ordered `StrategyRegistry`.
- Create: `packages/renderer/src/display-mode.ts`
  - Reversible source hiding/restoring helpers for `original`, `dual`, and `translation`.
- Modify: `packages/renderer/src/renderer.test.ts`
  - Strategy plan/apply/revert and display-mode tests.

### Runtime

- Modify: `packages/runtime/src/index.ts`
  - Keep `createContentRuntime()` as the public API for `apps/extension/entrypoints/lingoflow-content.ts`.
  - Move orchestration into `RuntimeController`.
- Create: `packages/runtime/src/controller.ts`
  - Page run lifecycle, scanner invocation, cache resolution, provider batches, progress, message command handlers.
- Create: `packages/runtime/src/store.ts`
  - `BlockStore` and state machine reducer.
- Create: `packages/runtime/src/queue.ts`
  - Deduped queue, viewport priority, batching, in-flight request tracking.
- Create: `packages/runtime/src/version.ts`
  - `VersionTracker`, run ids, revisions, mutation sequence, staleness checks.
- Create: `packages/runtime/src/events.ts`
  - Typed `RuntimeEventBus`.
- Create: `packages/runtime/src/bindings.ts`
  - `BlockBindingStore`, reverse lookup, generated-node cleanup, disconnected sweep.
- Create: `packages/runtime/src/observer.ts`
  - Mutation, viewport, route, and shadow-root observers.
- Create: `packages/runtime/src/render-coordinator.ts`
  - Runtime-owned render safety checks and strategy coordination.
- Modify: `packages/runtime/src/runtime.test.ts`
  - Controller and integration coverage.
- Create: `packages/runtime/src/store.test.ts`
- Create: `packages/runtime/src/queue.test.ts`
- Create: `packages/runtime/src/version.test.ts`
- Create: `packages/runtime/src/events.test.ts`
- Create: `packages/runtime/src/bindings.test.ts`
- Create: `packages/runtime/src/observer.test.ts`
- Create: `packages/runtime/src/render-coordinator.test.ts`

### Extension and E2E

- Modify: `apps/extension/entrypoints/lingoflow-content.ts`
  - Should still only install dev inspector once and call `createContentRuntime().start()`.
- Modify: `e2e/extension.spec.ts`
  - Add dynamic page, UI-exclusion, Shadow DOM, mode toggle, and stale-result acceptance tests.
- Modify: `packages/testkit/src/index.ts` if shared DOM fixtures or fake runtime helpers become repetitive.

## Implementation Tasks

### Task 1: Runtime Type Contracts

**Files:**
- Modify: `packages/types/src/index.ts`
- Create: `packages/types/src/runtime-contract.test.ts`

- [ ] **Step 1: Write type contract tests**

Add tests that prove a `TranslationBlock` can be JSON serialized without DOM references and that a `BlockBindingDraft`/`BlockBinding` carries DOM references separately.

```ts
import type { BlockBindingDraft, TranslationBlock } from './index'

describe('translation runtime contracts', () => {
  it('keeps TranslationBlock serializable and DOM-free', () => {
    const block: TranslationBlock = {
      id: 'block_1',
      revision: 1,
      runId: 'run_1',
      text: 'Readable source text that should be translated.',
      normalizedText: 'Readable source text that should be translated.',
      textHash: 'hash_1',
      requestText: 'Readable source text that should be translated.',
      inlineTokens: [],
      state: 'pending',
      meta: {
        tagName: 'p',
        carrierTagName: 'p',
        blockType: 'paragraph',
        insertion: 'linebreak-inside',
        depth: 3,
        visible: true,
        textLength: 47,
        rootKind: 'html',
      },
      sourceLang: 'auto',
      targetLang: 'zh-Hans',
      pageUrl: 'https://example.com/article',
      domain: 'example.com',
    }

    expect(JSON.parse(JSON.stringify(block))).toMatchObject({
      id: 'block_1',
      state: 'pending',
    })
  })

  it('keeps DOM references in binding drafts', () => {
    const carrierElement = document.createElement('p')
    const draft: BlockBindingDraft = {
      blockId: 'block_1',
      carrierElement,
      sourceNodes: [carrierElement],
      commonAncestor: carrierElement,
      sourceSignature: 'p:0:Readable source text',
    }

    expect(draft.carrierElement).toBe(carrierElement)
  })
})
```

- [ ] **Step 2: Run type contract tests to verify RED**

Run:

```bash
pnpm test -- packages/types/src/runtime-contract.test.ts
```

Expected: FAIL because the new runtime contract types do not exist.

- [ ] **Step 3: Add runtime contracts**

Add the contract types from the spec. Keep existing public provider/cache/settings types stable. Update `AppSettings.renderMode` and `PublicRuntimeSettings.renderMode` carefully:

```ts
export type PageDisplayMode = 'original' | 'dual' | 'translation'
export type LegacyRenderMode = 'below-original'
```

Keep settings compatibility by either preserving `renderMode: 'below-original'` and adding page display mode to runtime state, or by allowing both with a migration-safe union. Do not break existing settings tests.

- [ ] **Step 4: Run focused tests to verify GREEN**

Run:

```bash
pnpm test -- packages/types/src/runtime-contract.test.ts packages/settings/src/settings.test.ts packages/shared/src/messages.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/index.ts packages/types/src/runtime-contract.test.ts
git commit -m "feat(runtime): define translation runtime contracts"
```

### Task 2: Renderer Strategies and Display Modes

**Files:**
- Create: `packages/renderer/src/strategies.ts`
- Create: `packages/renderer/src/registry.ts`
- Create: `packages/renderer/src/display-mode.ts`
- Modify: `packages/renderer/src/index.ts`
- Modify: `packages/renderer/src/renderer.test.ts`

- [ ] **Step 1: Write failing strategy tests**

Add tests for `plan/apply/revert` on all built-in strategies:

- `linebreak-inside` inserts a generated `br` and inline wrapper inside the carrier.
- `inline-inside` inserts a spacer and inline wrapper.
- `inside-container` appends inside `li`, `td`, `th`, and `figcaption`.
- `before-nested-structure` inserts before nested `ul`/`ol`.
- `after-block` inserts after the safe block ancestor.
- every inserted node is `notranslate` and marked with LingoFlow data attributes.

Add display-mode tests:

```ts
it('hides and restores source nodes in translation mode without removing them', () => {
  document.body.innerHTML = '<p data-lingoflow-block-id="block_1">Original source text.</p>'
  const source = document.querySelector('p') as HTMLElement

  const hidden = hideSourceNodes([source])
  expect(source.dataset.lingoflowSourceHidden).toBe('true')
  expect(source.hidden).toBe(true)

  restoreSourceNodes(hidden)
  expect(source.hidden).toBe(false)
  expect(source.dataset.lingoflowSourceHidden).toBeUndefined()
})
```

- [ ] **Step 2: Run renderer tests to verify RED**

Run:

```bash
pnpm test -- packages/renderer/src/renderer.test.ts
```

Expected: FAIL because strategies and display-mode helpers do not exist.

- [ ] **Step 3: Implement pure strategy layer**

Implement strategy classes and `StrategyRegistry` in `packages/renderer`.

Rules:

- Do not import from `@lingoflow/runtime`.
- Use `textContent`, never provider HTML.
- Strategy `apply()` returns `InsertionResult`.
- Strategy `revert()` removes inserted nodes and restores hidden source nodes.
- Keep `renderBelowOriginal()`, `safeRender()`, and `clearTranslations()` as compatibility wrappers during runtime migration.

- [ ] **Step 4: Run renderer tests to verify GREEN**

Run:

```bash
pnpm test -- packages/renderer/src/renderer.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/renderer/src/index.ts packages/renderer/src/strategies.ts packages/renderer/src/registry.ts packages/renderer/src/display-mode.ts packages/renderer/src/renderer.test.ts
git commit -m "feat(renderer): add reversible insertion strategies"
```

### Task 3: DOM Scanner ScanResult Pipeline

**Files:**
- Modify: `packages/dom/src/index.ts`
- Create: `packages/dom/src/filters.ts`
- Create: `packages/dom/src/content-root.ts`
- Create: `packages/dom/src/page-adapters.ts`
- Create: `packages/dom/src/inline-tokenization.ts`
- Modify: `packages/dom/src/dom.test.ts`

- [ ] **Step 1: Write failing ScanResult tests**

Add tests for:

- `collectScanResults(document, options)` returns `{ block, binding }`.
- `block` is serializable and has no DOM references.
- `binding.carrierElement` points at the source carrier.
- scanner does not call provider, enqueue work, or render.
- scanner supports `figcaption` and `dd` block types.
- open ShadowRoot content under an accepted root is scanned.

Example:

```ts
it('returns serializable blocks and separate DOM binding drafts', async () => {
  document.body.innerHTML = '<main><p>Readable source paragraph long enough for translation.</p></main>'

  const results = await collectScanResults(document, defaultOptions)

  expect(results).toHaveLength(1)
  expect(JSON.stringify(results[0].block)).toContain('Readable source paragraph')
  expect(results[0].binding.carrierElement.tagName.toLowerCase()).toBe('p')
  expect(results[0].binding.sourceNodes.length).toBeGreaterThan(0)
})
```

- [ ] **Step 2: Write failing UI exclusion tests**

Add tests for:

- buttons, menus, toolbars, tab lists, dialogs, nav, forms, status badges are skipped.
- GitHub file list descriptions may be collected but action controls are skipped.
- table cells with many controls are skipped.
- direct text ratio below 30 percent is skipped unless `li`/`td` is a structural boundary.
- generated LingoFlow nodes and nodes inside them are skipped.

- [ ] **Step 3: Run DOM tests to verify RED**

Run:

```bash
pnpm test -- packages/dom/src/dom.test.ts
```

Expected: FAIL because `collectScanResults()` and new filters do not exist.

- [ ] **Step 4: Extract scanner modules**

Move logic out of the current large `packages/dom/src/index.ts` into focused files:

- `filters.ts`: `isVisible`, `isGeneratedByLingoFlow`, `hasTooManyInteractiveElements`, `isTranslatableTableCell`, `isTranslatableElement`.
- `content-root.ts`: `discoverContentRoots`, root scoring, root identity helpers.
- `page-adapters.ts`: default HTML adapter, open shadow root discovery, PDF text-layer adapter boundary.
- `inline-tokenization.ts`: `extractInlineText`, `protectInlineTextPatterns`, token helpers.

- [ ] **Step 5: Implement `collectScanResults()`**

The function should:

1. discover content roots,
2. collect candidates,
3. dedupe structural overlaps,
4. resolve text carrier,
5. extract text/request text/tokens,
6. compute `textHash`,
7. build `TranslationBlock` with `state: 'pending'`, `revision: 1`, and caller-provided `runId`,
8. build `BlockBindingDraft`,
9. return `ScanResult[]`.

Keep `collectTextBlocks()` as:

```ts
export async function collectTextBlocks(root: Document, options: CollectTextBlockOptions): Promise<TextBlock[]> {
  const results = await collectScanResults(root, {
    ...options,
    runId: 'legacy-run',
    rootGeneration: 1,
  })
  return results.map(result => toLegacyTextBlock(result.block))
}
```

Remove this wrapper only after every consumer is migrated.

- [ ] **Step 6: Run DOM tests to verify GREEN**

Run:

```bash
pnpm test -- packages/dom/src/dom.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/dom/src/index.ts packages/dom/src/filters.ts packages/dom/src/content-root.ts packages/dom/src/page-adapters.ts packages/dom/src/inline-tokenization.ts packages/dom/src/dom.test.ts
git commit -m "feat(dom): collect scan results with UI filtering"
```

### Task 4: Runtime Primitives

**Files:**
- Create: `packages/runtime/src/events.ts`
- Create: `packages/runtime/src/store.ts`
- Create: `packages/runtime/src/queue.ts`
- Create: `packages/runtime/src/version.ts`
- Create: `packages/runtime/src/bindings.ts`
- Create: `packages/runtime/src/events.test.ts`
- Create: `packages/runtime/src/store.test.ts`
- Create: `packages/runtime/src/queue.test.ts`
- Create: `packages/runtime/src/version.test.ts`
- Create: `packages/runtime/src/bindings.test.ts`

- [ ] **Step 1: Write failing RuntimeEventBus tests**

Test typed subscribe/unsubscribe and delivery order:

```ts
it('delivers subscribed events in order and stops after unsubscribe', () => {
  const bus = new RuntimeEventBus()
  const seen: string[] = []
  const off = bus.on('queue:changed', event => seen.push(`${event.queued}:${event.inFlight}`))

  bus.emit({ type: 'queue:changed', queued: 1, inFlight: 0 })
  off()
  bus.emit({ type: 'queue:changed', queued: 2, inFlight: 0 })

  expect(seen).toEqual(['1:0'])
})
```

- [ ] **Step 2: Write failing BlockStore state machine tests**

Cover legal and illegal transitions:

- `pending -> queued -> translating -> translated -> rendering -> rendered`
- provider failure: `translating -> failed`
- DOM mutation: `rendered -> dirty -> queued`
- clear and cancel from active states.
- stale provider result does not mutate current revision.

- [ ] **Step 3: Write failing BlockQueue tests**

Cover:

- deduped enqueue,
- viewport priority,
- batch size and char limits,
- in-flight request ids,
- clear removes queued and in-flight state.

- [ ] **Step 4: Write failing VersionTracker tests**

Cover `run-mismatch`, `revision-mismatch`, `detached`, `text-changed`, `source-signature-changed`, and `root-replaced`.

- [ ] **Step 5: Write failing BlockBindingStore tests**

Cover:

- `set/get/remove/clear`,
- `findByElement`,
- `findByAncestor`,
- `markRendered`,
- `removeRenderedNodes`,
- removed carrier cleanup,
- disconnected sweep,
- clear restores hidden source nodes and removes `data-lingoflow-block-id`.

- [ ] **Step 6: Run primitive tests to verify RED**

Run:

```bash
pnpm test -- packages/runtime/src/events.test.ts packages/runtime/src/store.test.ts packages/runtime/src/queue.test.ts packages/runtime/src/version.test.ts packages/runtime/src/bindings.test.ts
```

Expected: FAIL because the primitives do not exist.

- [ ] **Step 7: Implement runtime primitives**

Implementation notes:

- `RuntimeEventBus.on()` should return an unsubscribe function.
- `BlockStore.dispatch()` should return `{ from, to, block }` and emit state changes only through controller/coordinator, not inside pure store if that keeps tests simpler.
- `BlockQueue.dequeueBatch()` should return block ids and enough metadata to call `markInFlight()`.
- `VersionTracker.beginRun()` can use a simple monotonic id like `run_${Date.now()}_${counter}` for deterministic tests through injected id factories.
- `BlockBindingStore` should use `Map<string, BlockBinding>` plus `WeakMap<Node, string>` reverse indexes.

- [ ] **Step 8: Run primitive tests to verify GREEN**

Run:

```bash
pnpm test -- packages/runtime/src/events.test.ts packages/runtime/src/store.test.ts packages/runtime/src/queue.test.ts packages/runtime/src/version.test.ts packages/runtime/src/bindings.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/runtime/src/events.ts packages/runtime/src/store.ts packages/runtime/src/queue.ts packages/runtime/src/version.ts packages/runtime/src/bindings.ts packages/runtime/src/events.test.ts packages/runtime/src/store.test.ts packages/runtime/src/queue.test.ts packages/runtime/src/version.test.ts packages/runtime/src/bindings.test.ts
git commit -m "feat(runtime): add revision-aware runtime primitives"
```

### Task 5: RenderCoordinator

**Files:**
- Create: `packages/runtime/src/render-coordinator.ts`
- Create: `packages/runtime/src/render-coordinator.test.ts`
- Modify: `packages/runtime/src/bindings.ts`
- Modify: `packages/runtime/src/store.ts`
- Modify: `packages/renderer/src/index.ts` if exports are missing

- [ ] **Step 1: Write failing render coordinator tests**

Cover:

- missing binding emits/skips `missing-binding`.
- detached carrier skips `detached`.
- stale revision skips `stale`.
- same-text translation skips `same-text`.
- duplicate existing render skips `duplicate`.
- successful render applies strategy, updates binding inserted nodes, and transitions `translated -> rendering -> rendered`.
- `original`, `dual`, and `translation` display modes are reversible without provider calls.

Example:

```ts
it('discards stale translated text before touching DOM', async () => {
  const paragraph = document.createElement('p')
  paragraph.textContent = 'Fresh source text that changed.'
  document.body.appendChild(paragraph)

  const result = coordinator.renderTranslation({
    blockId: 'block_1',
    revision: 1,
    runId: 'old_run',
    translatedText: '旧译文',
  })

  expect(result).toMatchObject({ ok: false, reason: 'stale' })
  expect(document.querySelector('[data-lingoflow-translation]')).toBeNull()
})
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
pnpm test -- packages/runtime/src/render-coordinator.test.ts
```

Expected: FAIL because `RenderCoordinator` does not exist.

- [ ] **Step 3: Implement RenderCoordinator**

Responsibilities:

- create translation element with `notranslate`, `lang`, `data-lingoflow-translation`,
- run render safety checks in spec order,
- select strategy through `StrategyRegistry`,
- call `strategy.plan()` and `strategy.apply()`,
- update `BlockBindingStore.markRendered()`,
- dispatch block state transitions,
- emit `render:committed` or `render:skipped`,
- expose `setDisplayMode(mode)` for existing rendered bindings.

- [ ] **Step 4: Run render coordinator tests to verify GREEN**

Run:

```bash
pnpm test -- packages/runtime/src/render-coordinator.test.ts packages/renderer/src/renderer.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/render-coordinator.ts packages/runtime/src/render-coordinator.test.ts packages/runtime/src/bindings.ts packages/runtime/src/store.ts packages/renderer/src/index.ts
git commit -m "feat(runtime): coordinate safe translation rendering"
```

### Task 6: PageObserver

**Files:**
- Create: `packages/runtime/src/observer.ts`
- Create: `packages/runtime/src/observer.test.ts`
- Modify: `packages/runtime/src/events.ts`
- Modify: `packages/runtime/src/bindings.ts`

- [ ] **Step 1: Write failing observer tests**

Use fake timers where needed. Cover:

- generated LingoFlow mutations are ignored,
- source text mutation inside `data-lingoflow-block-id` marks block dirty,
- added readable content emits `observer:newContent` after new-content lane delay,
- removed carrier emits `binding:disconnected`,
- route changes through `pushState`, `replaceState`, `popstate`, and hash update increment root generation,
- open ShadowRoot gets its own observer,
- dirty lane fires faster than new-content lane.

- [ ] **Step 2: Run observer tests to verify RED**

Run:

```bash
pnpm test -- packages/runtime/src/observer.test.ts
```

Expected: FAIL because `PageObserver` does not exist.

- [ ] **Step 3: Implement observer lanes**

Implement:

- `MutationHandler` with separate dirty/new-content/disconnection lanes,
- generated-node detection that inspects target, added nodes, and removed nodes,
- `ViewportHandler` with `rootMargin: '200px'`,
- `RouteChangeHandler` wrapping `history.pushState` and `history.replaceState`,
- shadow-root observation registration,
- `disconnect()` cleanup for runtime clear/teardown tests.

Do not use one fixed global 500ms debounce.

- [ ] **Step 4: Run observer tests to verify GREEN**

Run:

```bash
pnpm test -- packages/runtime/src/observer.test.ts packages/runtime/src/bindings.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/observer.ts packages/runtime/src/observer.test.ts packages/runtime/src/events.ts packages/runtime/src/bindings.ts
git commit -m "feat(runtime): observe dynamic page changes"
```

### Task 7: RuntimeController Integration

**Files:**
- Create: `packages/runtime/src/controller.ts`
- Modify: `packages/runtime/src/index.ts`
- Modify: `packages/runtime/src/runtime.test.ts`
- Modify: `packages/runtime/src/progress-update.test.ts`
- Modify: `apps/extension/entrypoints/lingoflow-content.ts` only if public API shape changes

- [ ] **Step 1: Write failing controller tests**

Add tests that cover:

- `translatePage()` scans into `ScanResult[]`, materializes bindings, creates tasks, and renders cache/provider results through `RenderCoordinator`.
- provider results with stale `runId`/`revision` are discarded.
- source DOM mutation while translation is in flight prevents old result rendering and requeues fresh revision.
- `page/clear` cancels in-flight work, removes generated nodes, restores hidden source, clears memory cache, and resets progress.
- `page/clearCache` clears content-runtime memory cache.
- progress derives honest `done`, `partial`, `failed`, and `cancelled` states.
- current-page target override still does not mutate saved defaults.
- translation concurrency remains bounded.

- [ ] **Step 2: Run runtime tests to verify RED**

Run:

```bash
pnpm test -- packages/runtime/src/runtime.test.ts packages/runtime/src/progress-update.test.ts
```

Expected: FAIL because controller integration is not wired.

- [ ] **Step 3: Implement RuntimeController**

Controller responsibilities:

1. own `BlockStore`, `BlockBindingStore`, `VersionTracker`, `BlockQueue`, `RuntimeEventBus`, `RenderCoordinator`, and `PageObserver`;
2. expose `translatePage(overrides)`, `clearPage()`, `clearMemoryCache()`, `setDisplayMode(mode)`, `getProgress()`, and `start()`;
3. keep background ownership for settings, persistent cache, and providers;
4. resolve memory cache before persistent cache;
5. batch misses with existing scheduler limits;
6. emit progress updates after each batch and observer-driven requeue;
7. ignore stale provider results.

Keep `createContentRuntime()` in `packages/runtime/src/index.ts` as:

```ts
export function createContentRuntime(dependencies: RuntimeDependencies = {}) {
  return new RuntimeController(dependencies)
}
```

or a thin wrapper if class construction needs private helpers.

- [ ] **Step 4: Add content script message support**

Preserve existing messages:

- `page/status`
- `page/clear`
- `page/clearCache`
- `page/translate`

Add runtime display-mode command:

- `page/setDisplayMode` with payload `{ mode: PageDisplayMode }`

If message types live in `packages/types/src/index.ts`, update them and add tests in `packages/shared/src/messages.test.ts`.

- [ ] **Step 5: Run runtime tests to verify GREEN**

Run:

```bash
pnpm test -- packages/runtime/src/runtime.test.ts packages/runtime/src/progress-update.test.ts packages/shared/src/messages.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/runtime/src/controller.ts packages/runtime/src/index.ts packages/runtime/src/runtime.test.ts packages/runtime/src/progress-update.test.ts packages/types/src/index.ts packages/shared/src/messages.test.ts apps/extension/entrypoints/lingoflow-content.ts
git commit -m "feat(runtime): wire full page translation controller"
```

### Task 8: Runtime Integration Regression Suite

**Files:**
- Modify: `packages/runtime/src/runtime.test.ts`
- Modify: `packages/dom/src/dom.test.ts`
- Modify: `packages/renderer/src/renderer.test.ts`
- Modify: `packages/testkit/src/index.ts` if shared helpers reduce duplication

- [ ] **Step 1: Add full integration fixtures**

Add fixtures for:

- GitHub Markdown with headings, `blockquote > p`, lists, tables, title links, captions.
- GitHub file list/commit UI with buttons, badges, menus, status widgets.
- dynamic article where source text changes before provider resolves.
- open ShadowRoot readable content.
- translation-only/original-only mode toggles.

- [ ] **Step 2: Add integration tests**

Runtime integration assertions:

- cached translation and provider translation both pass through revision checks;
- stale cache hit does not render after source changed;
- stale provider result after clear does not render;
- stale provider result after route change does not render;
- generated mutations do not create duplicate translations;
- display mode switching does not call provider again.

- [ ] **Step 3: Run focused integration tests**

Run:

```bash
pnpm test -- packages/runtime/src/runtime.test.ts packages/dom/src/dom.test.ts packages/renderer/src/renderer.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/runtime/src/runtime.test.ts packages/dom/src/dom.test.ts packages/renderer/src/renderer.test.ts packages/testkit/src/index.ts
git commit -m "test(runtime): cover dynamic translation integration"
```

### Task 9: Installed-Extension E2E Coverage

**Files:**
- Modify: `e2e/extension.spec.ts`
- Modify: `packages/testkit/src/index.ts` if server helpers are shared

- [ ] **Step 1: Add E2E fixture pages**

Extend the existing local article server helpers with pages for:

- generic article,
- GitHub-like Markdown,
- GitHub-like file list/commit UI,
- SPA route changes,
- infinite-scroll append,
- open Shadow DOM,
- provider failure,
- slow provider stale-result cases.

- [ ] **Step 2: Add E2E tests**

Add tests that assert:

- readable article content translates next to source;
- UI controls do not translate;
- SPA navigation detects new content;
- old in-flight result does not render into new route;
- appended infinite-scroll content translates once;
- open Shadow DOM translates and clears;
- provider failure leaves original content intact and reports honest progress;
- `page/setDisplayMode` toggles original/dual/translation without retranslation.

- [ ] **Step 3: Run E2E tests to verify behavior**

Run:

```bash
pnpm test:e2e
```

Expected: PASS. Public-page acceptance remains skipped unless `LINGOFLOW_PUBLIC_E2E=1` is set.

- [ ] **Step 4: Commit**

```bash
git add e2e/extension.spec.ts packages/testkit/src/index.ts
git commit -m "test(extension): verify dynamic translation runtime"
```

### Task 10: Import Boundary and Full Verification

**Files:**
- Modify: only files needed to fix issues found by verification

- [ ] **Step 1: Check package import boundaries**

Run:

```bash
rg -n "from '@lingoflow/(dom|renderer|runtime|cache|scheduler|settings|providers)'" packages/types packages/shared
rg -n "from '@lingoflow/runtime'" packages/dom packages/renderer packages/shared packages/types
rg -n "from '@lingoflow/renderer'" packages/dom packages/shared packages/types
```

Expected: no output.

- [ ] **Step 2: Run unit tests**

Run:

```bash
pnpm test
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: Run installed-extension E2E**

Run:

```bash
pnpm test:e2e
```

Expected: PASS, with public-page acceptance skipped unless explicitly enabled.

- [ ] **Step 5: Optional public-page acceptance**

Only run when network and provider setup are intentionally available:

```bash
LINGOFLOW_PUBLIC_E2E=1 pnpm test:e2e
```

Expected: PASS or document network/provider-specific failure clearly.

- [ ] **Step 6: Final cleanup**

Run:

```bash
git diff --check
git status --short
```

Expected:

- no whitespace errors,
- only intended runtime rewrite files are changed,
- unrelated user changes remain untouched.

- [ ] **Step 7: Commit verification fixes**

If verification required fixes:

```bash
git add <verified runtime rewrite files>
git commit -m "fix(runtime): complete translation runtime verification"
```

## Acceptance Checklist

The implementation is complete only when every item below is true:

- [ ] `TranslationBlock` contains no DOM references.
- [ ] `BlockBinding` owns DOM references and is cleaned when nodes disconnect.
- [ ] No package import cycle exists.
- [ ] `packages/renderer` does not import `packages/runtime`.
- [ ] `packages/dom` does not import `packages/runtime` or `packages/renderer`.
- [ ] Every provider result is checked against `runId` and `revision` before rendering.
- [ ] Dynamic DOM changes mark affected blocks dirty and requeue them.
- [ ] Generated LingoFlow nodes do not trigger duplicate translation loops.
- [ ] UI components are excluded by selector, role, interactive density, and direct text ratio.
- [ ] Translations render inline next to source text using insertion strategies.
- [ ] `original`, `dual`, and `translation` modes work without retranslation.
- [ ] `page/clear` removes generated nodes and restores hidden source text.
- [ ] `page/clearCache` invalidates content-runtime memory cache.
- [ ] Existing provider, settings, persistent cache, and low-permission extension boundaries remain intact.
- [ ] `pnpm test` passes.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm test:e2e` passes.

## Execution Notes

- Use TDD for every task: write the failing test, verify it fails for the intended reason, implement the smallest coherent unit, then verify it passes.
- Commit after each task. Do not stage unrelated dirty files.
- Preserve provider output safety: no `innerHTML` for translated text.
- Preserve Manifest V3 low-permission posture: do not add `<all_urls>`.
- Treat native Chrome permission prompts as manual verification unless automation can control native dialogs.
- If browser fill/type is flaky during E2E, use Chrome extension APIs and DOM assertions rather than blocking on clipboard-style automation.
