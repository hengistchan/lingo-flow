# LingoFlow Translation Runtime - Architecture Redesign (v3)

**Date:** 2026-06-20
**Status:** Approved for full implementation
**Scope:** Full rewrite of DOM collection, translation runtime state, dynamic page observation, and rendering logic

## 1. Design Thesis

LingoFlow is a page translation runtime, not a one-shot translation API caller.
The runtime must understand readable page content, keep translations attached to
the correct source DOM, survive dynamic page changes, and avoid translating page
UI such as buttons, menus, toolbars, forms, navigation, and generated extension
nodes.

This document is the implementation contract for the full rewrite.
Implementation is complete only when the scanner, runtime state machine, queue,
observer, binding store, renderer, display modes, and acceptance tests all land
together and pass the verification suite.

### 1.1 Core Principles

1. **Domain/DOM separation** - `TranslationBlock` is serializable and cacheable;
   `BlockBinding` owns live DOM references.
2. **Runtime-owned orchestration** - the content runtime owns scanning,
   page-level task state, DOM bindings, rendering, and in-memory page cache.
   The background service worker owns provider calls, settings, and persistent
   cache.
3. **No package cycles** - lower-level packages define data, scanning, and DOM
   operations; `packages/runtime` coordinates them.
4. **Explicit state machines** - typed events and guarded transitions replace
   scattered boolean flags.
5. **Revision-aware rendering** - every provider result is checked against the
   current block revision before it can touch the DOM.
6. **Pluggable insertion strategies** - placement is selected through strategy
   objects, not hardcoded condition chains.
7. **Generated-node isolation** - every inserted node is marked `notranslate`
   and with LingoFlow data attributes so scanning and observers can distinguish
   extension output from page content.

## 2. Package Dependency Contract

The most important architectural constraint is dependency direction:

```txt
apps/extension
  -> packages/runtime
      -> packages/dom
      -> packages/renderer
      -> packages/scheduler
      -> packages/cache
  -> packages/types

packages/dom      -> packages/types, packages/shared
packages/renderer -> packages/types, packages/shared
packages/shared   -> packages/types
packages/types    -> no local package imports
```

Allowed imports:

| Package | May import | Must not import |
|---|---|---|
| `packages/types` | none | any runtime package |
| `packages/shared` | `@lingoflow/types` | `dom`, `renderer`, `runtime`, extension code |
| `packages/dom` | `types`, `shared` | `renderer`, `runtime`, extension code |
| `packages/renderer` | `types`, `shared` | `dom`, `runtime`, extension code |
| `packages/runtime` | `types`, `shared`, `dom`, `renderer`, `scheduler`, `cache` | extension UI |
| `apps/extension` | runtime and package APIs | package internals |

`RenderEngine` orchestration belongs in `packages/runtime`, because it needs
`BlockStore`, `BlockBindingStore`, `VersionTracker`, and `RuntimeEventBus`. The
`packages/renderer` package exports pure DOM insertion strategies and helpers
only. This prevents the current runtime -> renderer import from becoming a
runtime <-> renderer cycle.

## 3. Architecture Overview

```txt
Content Script
  ContentRuntime
    RuntimeController
      PageScanner.collect(root) -> ScanResult[]
      BlockStore
      BlockBindingStore
      VersionTracker
      BlockQueue
      RuntimeEventBus
      RenderCoordinator
        StrategyRegistry
        InsertionStrategy[]
      PageObserver
        MutationHandler
        ViewportHandler
        RouteChangeHandler

Background Service Worker
  SettingsGateway
  PersistentCacheGateway
  ProviderGateway
```

### 3.1 Module Boundaries

| Module | Responsibility | File |
|---|---|---|
| `PageScanner` | Discover readable roots, collect candidates, filter UI, emit scan results | `packages/dom/src/index.ts` |
| `BlockStore` | CRUD and state transitions for `TranslationBlock` | `packages/runtime/src/store.ts` |
| `BlockQueue` | Deduped queue, viewport priority, batching, in-flight tracking | `packages/runtime/src/queue.ts` |
| `VersionTracker` | Block revisions, mutation sequence, staleness checks | `packages/runtime/src/version.ts` |
| `RuntimeEventBus` | Typed fact events for runtime components | `packages/runtime/src/events.ts` |
| `BlockBindingStore` | Live DOM references, reverse lookup, disconnected-node cleanup | `packages/runtime/src/bindings.ts` |
| `RenderCoordinator` | Runtime-owned render orchestration and state transitions | `packages/runtime/src/render-coordinator.ts` |
| `InsertionStrategy` | Pure insertion planning, apply, and revert helpers | `packages/renderer/src/strategies.ts` |
| `PageObserver` | Mutation, viewport, route, and shadow-root observation | `packages/runtime/src/observer.ts` |

Communication between components uses method calls for commands and typed events
for facts. For example, `RuntimeController.enqueue(blockId)` is a command;
`block:stateChanged` is a fact emitted after the state changed.

## 4. Domain and DOM Models

### 4.1 ScanResult

Scanning sees the DOM, so it must return both a pure block and a live binding
draft. The block stays serializable; the binding draft is immediately
materialized by the runtime.

```ts
type ScanResult = {
  block: TranslationBlock
  binding: BlockBindingDraft
}

type BlockBindingDraft = {
  blockId: string
  carrierElement: HTMLElement
  sourceNodes: Node[]
  commonAncestor: HTMLElement
  sourceSignature: string
}
```

`PageScanner` must not enqueue work, call providers, or render translations. It
may mark source carriers only through a runtime-provided materialization step,
so collection remains testable and runtime-owned.

### 4.2 TranslationBlock

`TranslationBlock` is the domain entity used by queues, provider tasks, cache
keys, and state transitions.

```ts
type BlockState =
  | 'pending'
  | 'queued'
  | 'translating'
  | 'translated'
  | 'rendering'
  | 'rendered'
  | 'failed'
  | 'dirty'
  | 'stale'
  | 'skipped'
  | 'cancelled'

type TranslationBlock = {
  id: string
  revision: number
  runId: string

  text: string
  normalizedText: string
  textHash: string
  requestText: string
  inlineTokens: InlineToken[]

  translatedText?: string
  failure?: {
    message: string
    reason?: string
  }

  state: BlockState

  meta: {
    tagName: string
    carrierTagName: string
    blockType: TextBlockType
    insertion: TranslationInsertion
    depth: number
    visible: boolean
    textLength: number
    rootKind: ContentRootKind
  }

  sourceLang: 'auto' | string
  targetLang: string
  pageUrl: string
  domain: string
}
```

### 4.3 BlockBinding

`BlockBinding` is a DOM adapter. It must never be serialized, cached, or sent to
the background worker.

```ts
type BlockBinding = {
  blockId: string
  revision: number
  runId: string

  carrierElement: HTMLElement
  sourceNodes: Node[]
  commonAncestor: HTMLElement

  insertedNodes: Node[]
  hiddenSourceNodes: HTMLElement[]
  loadingElement: HTMLElement | null

  sourceSignature: string
  collectedAtMutationSeq: number
  rootGeneration: number
}
```

### 4.4 Why Split Block and Binding?

| Concern | `TranslationBlock` | `BlockBinding` |
|---|---:|---:|
| Serializable | yes | no |
| Cacheable | yes | no |
| Provider request input | yes | no |
| Holds DOM refs | no | yes |
| Render cleanup | no | yes |
| Staleness identity | revision metadata | live DOM snapshot |

This split is mandatory. It lets the runtime safely discard stale provider
results while preserving cache reuse for unchanged text.

## 5. State Machines

### 5.1 Block State Machine

The block state machine tracks translation and rendering. Translation success
does not imply DOM render success.

```ts
type BlockEvent =
  | { type: 'COLLECT'; runId: string; revision: number }
  | { type: 'ENQUEUE' }
  | { type: 'TRANSLATE_START'; requestId: string }
  | { type: 'TRANSLATE_SUCCESS'; requestId: string; text: string }
  | { type: 'TRANSLATE_FAIL'; requestId: string; error: string }
  | { type: 'RENDER_START' }
  | { type: 'RENDER_COMMIT' }
  | { type: 'RENDER_SKIP'; reason: RenderSkipReason }
  | { type: 'DOM_MUTATED'; currentTextHash?: string }
  | { type: 'REQUEUE'; revision: number }
  | { type: 'MARK_STALE'; reason: string }
  | { type: 'CLEAR' }
  | { type: 'CANCEL' }
```

Required transitions:

| From | Event | To | Notes |
|---|---|---|---|
| `pending` | `ENQUEUE` | `queued` | Added to `BlockQueue` |
| `queued` | `TRANSLATE_START` | `translating` | Queue marks request in flight |
| `translating` | `TRANSLATE_SUCCESS` | `translated` | Only if request revision is current |
| `translating` | `TRANSLATE_FAIL` | `failed` | Keeps original DOM unchanged |
| `translated` | `RENDER_START` | `rendering` | Render coordinator owns this |
| `rendering` | `RENDER_COMMIT` | `rendered` | Inserted or updated DOM committed |
| `rendering` | `RENDER_SKIP` | `skipped` | Same-text, no binding, hidden, or stale |
| `rendered` | `DOM_MUTATED` | `dirty` | Existing translation must be removed or replaced |
| `dirty` | `REQUEUE` | `queued` | New revision replaces old binding |
| any active state | `MARK_STALE` | `stale` | Old result must not render |
| any active state | `CLEAR` | `pending` | Removes DOM output and resets translation result |
| any active state | `CANCEL` | `cancelled` | Used for clear, route change, and new page run |

If a provider result arrives for a stale `runId`, `revision`, or request id, it
must be ignored and emitted as `translation:discarded`. It must not transition
the current block.

### 5.2 Page Runtime State

`PageRunState` tracks work. It is separate from display mode.

```ts
type PageRunState =
  | 'idle'
  | 'scanning'
  | 'translating'
  | 'rendering'
  | 'done'
  | 'partial'
  | 'failed'
  | 'clearing'
  | 'cancelled'
```

Progress is derived from block states:

- `done`: every non-skipped block is rendered or came from a valid cache hit.
- `partial`: at least one block rendered and at least one block failed/skipped.
- `failed`: no block rendered and at least one block failed, or no readable
  blocks were found.
- `cancelled`: current run was superseded or cleared.

### 5.3 Page Display Mode

Display mode controls how rendered translations are shown.

```ts
type PageDisplayMode = 'original' | 'dual' | 'translation'
```

Mode behavior:

| Mode | Source text | Translation text | DOM behavior |
|---|---|---|---|
| `original` | visible | hidden or removed | Revert inserted nodes or hide them |
| `dual` | visible | visible | Default bilingual rendering |
| `translation` | hidden non-destructively | visible | Source nodes get reversible hidden markers |

Switching display modes must not call the provider again. It only re-applies
existing bindings and inserted nodes. Hiding original content must be reversible
and must not remove source nodes.

## 6. Runtime Events

`RuntimeEventBus` emits immutable facts. Event names should not be reused for
different meanings.

```ts
type RuntimeEvent =
  | { type: 'scan:started'; runId: string; rootGeneration: number }
  | { type: 'scan:completed'; runId: string; blockIds: string[] }
  | { type: 'block:collected'; runId: string; blockId: string; revision: number }
  | { type: 'block:stateChanged'; blockId: string; from: BlockState; to: BlockState; reason?: string }
  | { type: 'block:dirty'; blockId: string; revision: number; cause: MutationCause }
  | { type: 'queue:changed'; queued: number; inFlight: number }
  | { type: 'translation:requested'; blockIds: string[]; requestId: string }
  | { type: 'translation:resolved'; blockId: string; requestId: string; revision: number; text: string }
  | { type: 'translation:failed'; blockId: string; requestId: string; revision: number; error: string }
  | { type: 'translation:discarded'; blockId: string; requestId: string; reason: string }
  | { type: 'render:committed'; blockId: string; revision: number; nodeCount: number }
  | { type: 'render:skipped'; blockId: string; revision: number; reason: RenderSkipReason }
  | { type: 'binding:disconnected'; blockId: string; revision: number }
  | { type: 'binding:rebound'; blockId: string; fromRevision: number; toRevision: number }
  | { type: 'observer:newContent'; root: HTMLElement; cause: MutationCause }
  | { type: 'observer:viewportEnter'; blockId: string }
  | { type: 'observer:viewportExit'; blockId: string }
  | { type: 'page:runStateChanged'; from: PageRunState; to: PageRunState }
  | { type: 'page:displayModeChanged'; from: PageDisplayMode; to: PageDisplayMode }
```

Event granularity is intentionally middle-sized:

- Block lifecycle changes are represented by one generic
  `block:stateChanged`, with reason metadata.
- Provider results use separate resolved, failed, and discarded events because
  these are operationally important and easy to confuse.
- Rendering uses committed and skipped events because DOM writes can fail even
  after translation succeeds.
- Observer events stay coarse; expensive DOM details remain in the observer and
  binding store.

## 7. VersionTracker and Staleness

Text hash alone is not a DOM staleness signal. It is useful for cache identity,
but a DOM node can be replaced with identical text, moved into a hidden UI
region, or detached while retaining the same text hash.

`VersionTracker` must track both text identity and DOM identity:

```ts
type BlockVersion = {
  blockId: string
  runId: string
  revision: number
  textHash: string
  sourceSignature: string
  collectedAtMutationSeq: number
  rootGeneration: number
}

class VersionTracker {
  beginRun(): string
  nextRootGeneration(): number
  incrementMutationSeq(cause: MutationCause): number

  recordBlock(version: BlockVersion): void
  current(blockId: string): BlockVersion | undefined
  markStale(blockId: string, reason: string): void
  removeBlock(blockId: string): void

  canRender(input: {
    block: TranslationBlock
    binding: BlockBinding
    expectedRunId: string
    expectedRevision: number
    currentTextHash: string
    currentSourceSignature: string
  }): StalenessResult
}
```

`canRender()` returns a typed result, not just boolean:

```ts
type StalenessResult =
  | { ok: true }
  | { ok: false; reason: 'run-mismatch' | 'revision-mismatch' | 'detached' | 'text-changed' | 'source-signature-changed' | 'root-replaced' }
```

Render checks must include:

1. `binding.carrierElement.isConnected`
2. current `runId` and `revision`
3. current normalized source text hash
4. current source signature
5. current root generation

`sourceSignature` should be deterministic and cheap. It can combine carrier tag
name, nearest content root identity, stable ancestor path, and source node text
shape. It must not depend on page-specific class names alone.

## 8. BlockBindingStore and DOM Synchronization

`BlockBindingStore` owns live DOM references and their reverse indexes.

```ts
class BlockBindingStore {
  set(blockId: string, binding: BlockBinding): void
  get(blockId: string): BlockBinding | undefined
  remove(blockId: string): void
  clear(): void

  findByElement(element: HTMLElement): BlockBinding | undefined
  findByAncestor(node: Node): BlockBinding | undefined

  markRendered(blockId: string, result: InsertionResult): void
  removeRenderedNodes(blockId: string): void
  removeDisconnectedFrom(records: MutationRecord[]): string[]
  sweepDisconnected(): string[]
}
```

Synchronization rules:

- Maintain `Map<blockId, BlockBinding>` for direct lookup.
- Maintain `WeakMap<Node, blockId>` for source nodes, carrier elements, and
  inserted nodes.
- On `removedNodes`, remove or mark stale any binding whose carrier,
  common ancestor, or inserted nodes were detached.
- On `characterData` within a source carrier, mark the block dirty unless the
  mutation only touches generated LingoFlow nodes.
- On clear, remove inserted nodes, restore hidden source nodes, remove
  `data-lingoflow-block-id`, clear reverse indexes, and reset stores.
- Periodically call `sweepDisconnected()` after large mutation batches to avoid
  keeping strong references to detached DOM.

The store must never rely only on querying
`[data-lingoflow-block-id="${blockId}"]` during render. That selector is a
fallback, not the canonical binding identity.

## 9. PageScanner and UI Filtering

### 9.1 Content Root Discovery

Root discovery should prefer known reading containers and then fall back to
scored generic roots.

Preferred roots include:

- `article`, `main`, `[role="main"]`
- `.markdown-body`, `.prose`, `.md-content`
- `#content`, `#mw-content-text`, `.mw-parser-output`
- open `ShadowRoot` descendants of accepted roots

Fallback scoring uses text length, paragraph/list count, heading count, link
density, interactive density, and visible area.

### 9.2 Block Types

```ts
type TextBlockType =
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'quote'
  | 'table'
  | 'caption'
  | 'description'
  | 'unknown'
```

Code blocks are not translated as normal reading text. `pre`, `code`, `kbd`,
URLs, package identifiers, issue references, and commit hashes are protected as
inline tokens. Figure captions and image captions are translatable through the
`caption` type. Image `alt` text is not rendered into the page by default; an
accessibility-specific adapter can expose it without changing the runtime state
model.

### 9.3 UI Exclusion

Base ignore selectors:

```ts
const IGNORE_SELECTORS = [
  'script',
  'style',
  'code',
  'pre',
  'textarea',
  'input',
  'button',
  'select',
  'nav',
  'footer',
  'header',
  'svg',
  'canvas',
  '[contenteditable="true"]',
  '[data-lingoflow-ignore]',
  '[data-lingoflow-translation]',
]
```

Additional UI filters:

- Reject elements with interactive density above the threshold.
- Reject toolbars, menus, tab lists, comboboxes, dialogs, popovers, and status
  widgets by semantic role.
- Reject elements where direct readable text is less than 30 percent of total
  descendant text unless the block is a structural boundary such as `li` or
  `td`.
- Reject high link-density containers unless a single text-bearing anchor is
  the primary carrier.
- Reject short badge/status/action table cells by class and role patterns.
- Reject nodes hidden by CSS, `hidden`, or `aria-hidden="true"`.
- Reject generated extension nodes and nodes inside generated extension nodes.

### 9.4 Scan Output

For every accepted candidate:

1. Resolve the source carrier.
2. Extract normalized text.
3. Create protected `requestText` and `inlineTokens`.
4. Compute `textHash`.
5. Choose `TextBlockType`.
6. Choose `TranslationInsertion`.
7. Create `ScanResult`.

The runtime materializes the binding by setting `data-lingoflow-block-id` and
registering source nodes with `BlockBindingStore`.

## 10. Queue and Translation Flow

`BlockQueue` must dedupe block ids, prioritize viewport blocks, and track
in-flight request ids.

```ts
class BlockQueue {
  enqueue(blockId: string, priority?: QueuePriority): void
  prioritize(blockId: string): void
  dequeueBatch(limits: BatchLimits): QueuedBatch
  markInFlight(batch: QueuedBatch, requestId: string): void
  resolveRequest(requestId: string): void
  remove(blockId: string): void
  clear(reason: string): void
}
```

Translation flow:

```txt
RuntimeController.translatePage()
  -> begin run
  -> clear previous rendered output and cancel previous in-flight requests
  -> scan roots into ScanResult[]
  -> materialize bindings
  -> add blocks to BlockStore
  -> resolve memory cache
  -> resolve persistent cache through background
  -> enqueue misses
  -> send provider batches through background
  -> accept only current runId + revision results
  -> render through RenderCoordinator
  -> derive page progress from block states
```

The background message protocol remains unchanged in ownership:

- Content runtime sends translation tasks.
- Background resolves persistent cache and calls providers.
- Provider output is plain text only.
- Content runtime restores inline tokens before rendering if needed.

Cache keys remain isolated by text hash, source language, target language,
provider id, model, prompt version, and normalization version.

## 11. Insertion Strategies

### 11.1 Renderer Package Interface

The renderer package contains pure strategy logic. It does not know about
`RuntimeEventBus`, `BlockStore`, `VersionTracker`, or background messages.

```ts
interface InsertionStrategy {
  readonly name: TranslationInsertion
  canApply(block: TranslationBlock, binding: BlockBinding, mode: PageDisplayMode): boolean
  plan(block: TranslationBlock, binding: BlockBinding, mode: PageDisplayMode): InsertionPlan
  apply(plan: InsertionPlan): InsertionResult
  revert(result: InsertionResult): void
}

type InsertionPlan = {
  blockId: string
  mode: PageDisplayMode
  target: HTMLElement
  translationElement: HTMLElement
  placement: TranslationInsertion
  sourceNodesToHide: HTMLElement[]
}

type InsertionResult = {
  blockId: string
  insertedNodes: Node[]
  hiddenSourceNodes: HTMLElement[]
}
```

`RenderCoordinator` creates translation elements, asks the registry for a
strategy, applies the result, updates `BlockBindingStore`, and emits runtime
events.

### 11.2 Built-in Strategies

Priority order:

1. `LinebreakInsideStrategy` - paragraphs, long headings, and primary title
   links where translation should stay attached to the carrier.
2. `InlineInsideStrategy` - short headings and label-like blocks.
3. `InsideContainerStrategy` - table cells, simple list items, captions, and
   structural containers.
4. `BeforeNestedStructureStrategy` - parent list items with nested `ul` or
   `ol`.
5. `AfterBlockStrategy` - fallback for blocks that cannot safely contain a
   generated node.

Adding a new insertion strategy requires:

1. Add a `TranslationInsertion` value in `packages/types`.
2. Implement `InsertionStrategy`.
3. Register it in `StrategyRegistry` with priority.
4. Add scanner classification rules.
5. Add unit tests for plan/apply/revert.
6. Add integration tests proving clear and display-mode switching are
   reversible.

### 11.3 Display Modes

Strategies must support all display modes:

- In `dual`, insert translation and keep source visible.
- In `translation`, insert translation and hide source nodes using reversible
  attributes/classes. Do not remove source nodes.
- In `original`, remove or hide translation nodes and restore source nodes.

Mode switching must operate from existing `BlockBinding` and `InsertionResult`
data. It must not rescan or retranslate unless the block is dirty/stale.

## 12. Dynamic Page Observation

### 12.1 MutationObserver

Observe:

- `childList`
- `characterData`
- selected attributes: `hidden`, `aria-hidden`, `style`, `class`

Do not use one global 500ms debounce for every mutation. Use separate lanes:

| Lane | Trigger | Delay | Max wait | Action |
|---|---|---:|---:|---|
| Dirty block | text changes inside existing binding | 50-100ms | 250ms | mark block dirty, remove stale render, requeue |
| New content | added readable roots or route view replacement | 250-500ms | 1000ms | scan pending roots |
| Disconnection cleanup | removed bound nodes | immediate microtask | 100ms | stale/remove binding |
| Large churn | many mutations in one window | idle callback fallback | 1500ms | rescan top content root |

Generated-node detection must inspect added and removed nodes. A mutation is
ignored only if every affected node is generated by LingoFlow. A mutation whose
target is a source carrier with `data-lingoflow-block-id` is not automatically
ignored, because frameworks often mutate text inside the same carrier.

### 12.2 IntersectionObserver

Viewport observation is a priority signal, not a correctness signal.

- Use `rootMargin: '200px'` as default.
- Prioritize visible blocks in `BlockQueue`.
- Do not drop offscreen blocks permanently.
- Unobserve disconnected carriers during binding cleanup.

### 12.3 Route and SPA Changes

The observer must detect URL changes caused by:

- `pushState`
- `replaceState`
- `popstate`
- hash navigation

On route change:

1. Increment root generation.
2. Cancel in-flight requests from the previous run.
3. Sweep disconnected bindings.
4. Scan the new content root.
5. Keep persistent cache available, but only render results matching the new
   run and revision.

### 12.4 Shadow DOM

Open `ShadowRoot` instances are supported as additional roots:

- Scan open shadow roots under accepted content roots.
- Register one observer per shadow root.
- Inject style into the owning document and, when needed, into the shadow root.
- Keep binding identity root-aware so the same text in document and shadow DOM
  does not collide.

Closed shadow roots cannot be inspected. They are out of scope for DOM
translation and should be skipped without failure.

### 12.5 PDF and Non-HTML Page Adapters

The runtime exposes a page adapter boundary:

```ts
interface PageAdapter {
  readonly name: string
  canHandle(root: Document): boolean
  getContentRoots(root: Document): Array<Document | ShadowRoot | HTMLElement>
  classifyRoot(root: Node): ContentRootKind
}
```

The default adapter handles normal HTML documents and open shadow roots. PDF
support should be implemented as an adapter for browser PDF viewers that expose
a text layer in the DOM. If a PDF viewer does not expose readable text nodes,
the runtime reports `no_readable_text` and leaves the page unchanged.

## 13. Render Safety

Render safety checks are mandatory and ordered:

1. Binding exists.
2. Carrier is connected.
3. Run and revision are current.
4. Current source text hash matches expected revision.
5. Current source signature matches expected revision.
6. Translation is not equivalent to source text after normalization.
7. No existing current translation node is already attached for the same block.
8. Strategy can apply to the current binding and display mode.

`RenderSkipReason`:

```ts
type RenderSkipReason =
  | 'missing-binding'
  | 'detached'
  | 'stale'
  | 'same-text'
  | 'duplicate'
  | 'unsupported-strategy'
  | 'mode-hidden'
```

Duplicate detection must use `BlockBindingStore` first and DOM selectors second.
Sibling-only detection is insufficient for `linebreak-inside`,
`inside-container`, and shadow-root rendering.

## 14. File Structure

```txt
packages/
  types/
    src/
      index.ts
        # TranslationBlock, BlockBinding, ScanResult, state/event types
  dom/
    src/
      index.ts
      filters.ts
      content-root.ts
      page-adapters.ts
      inline-tokenization.ts
  renderer/
    src/
      index.ts
      strategies.ts
      registry.ts
      display-mode.ts
  runtime/
    src/
      index.ts
      controller.ts
      store.ts
      queue.ts
      version.ts
      events.ts
      bindings.ts
      observer.ts
      render-coordinator.ts
```

`packages/runtime/src/index.ts` should export the public
`createContentRuntime()` API used by the extension entrypoint. Internal classes
should be exported only when tests need them.

## 15. Full Implementation Scope

The implementation must replace the existing one-shot runtime with the complete
architecture in this document. The product should not ship a runtime where
dynamic observation, revision checks, or binding cleanup are omitted.

Required implementation work:

1. Move shared contracts into `packages/types`.
2. Refactor DOM collection to return `ScanResult[]`.
3. Add UI filtering improvements and page adapter boundary.
4. Add `BlockStore`, `BlockQueue`, `VersionTracker`, `RuntimeEventBus`, and
   `BlockBindingStore`.
5. Move insertion strategy logic into `packages/renderer`.
6. Add runtime-owned `RenderCoordinator`.
7. Add `PageObserver` for mutation, viewport, route, and shadow-root handling.
8. Add display modes: `original`, `dual`, and `translation`.
9. Wire content runtime messages to the new controller.
10. Preserve provider, settings, persistent cache, and low-permission extension
    boundaries.
11. Preserve `page/clear`, `page/clearCache`, and progress reporting behavior.
12. Add the full test and acceptance suite below.

## 16. Testing Strategy

### 16.1 Unit Tests

Required unit coverage:

- `BlockStore`: CRUD, legal transitions, illegal transition behavior.
- State machine: all valid transitions and stale result rejection.
- `BlockQueue`: dedupe, prioritization, batching, in-flight requests, clear.
- `VersionTracker`: revision checks, run mismatch, detached binding, text hash
  mismatch, source signature mismatch.
- `RuntimeEventBus`: typed subscribe, unsubscribe, event delivery order.
- `BlockBindingStore`: direct lookup, reverse lookup, render node tracking,
  removed-node cleanup, disconnected sweep.
- DOM filters: UI roles, interactive density, table cell filters, direct text
  ratio, generated-node exclusion.
- Insertion strategies: plan, apply, revert for every built-in strategy and
  every display mode.

### 16.2 Integration Tests

Required DOM integration coverage:

- `PageScanner -> BlockStore -> BlockBindingStore -> RenderCoordinator` full
  path.
- Cached translation renders through the same revision checks as provider
  results.
- In-flight provider result is discarded after source text changes.
- In-flight provider result is discarded after clear.
- In-flight provider result is discarded after SPA route change.
- Mutation inside source carrier marks block dirty even when carrier has
  `data-lingoflow-block-id`.
- LingoFlow-generated mutations are ignored.
- Removed source carrier disconnects binding and removes stale render output.
- Shadow DOM content scans, renders, clears, and observes correctly.
- Display mode switching is reversible without provider calls.
- `page/clearCache` clears in-memory page cache as well as persistent cache
  through existing background flow.

### 16.3 E2E Tests

Required browser-level coverage:

- GitHub Markdown/article fixture: headings, paragraphs, blockquotes, lists,
  tables, captions, and title links translate once with correct placement.
- GitHub file list and commit UI: descriptions may translate; buttons,
  menus, badges, toolbars, nav, and status widgets do not translate.
- Generic article page: all readable content translates inline next to source.
- SPA fixture: new route content is detected and old in-flight results do not
  render into the new route.
- Dynamic infinite-scroll fixture: newly appended readable content is detected
  without duplicate translations.
- Shadow DOM fixture: open shadow-root readable content translates and clears.
- Provider failure fixture: original page remains intact and progress is honest.
- Translation-only and original-only mode toggles do not retranslate.

### 16.4 Verification Commands

Completion requires fresh successful output from:

```bash
pnpm test
pnpm typecheck
pnpm test:e2e
```

When public-page acceptance is intentionally run:

```bash
LINGOFLOW_PUBLIC_E2E=1 pnpm test:e2e
```

Native Chrome permission prompts for custom provider origins remain manual
verification unless the automation stack can control native dialogs.

## 17. Acceptance Criteria

The rewrite is acceptable when all of the following are true:

- No package import cycle exists.
- `TranslationBlock` is serializable and contains no DOM references.
- `BlockBinding` owns DOM references and is cleaned when nodes disconnect.
- Every provider result is checked against `runId` and `revision` before
  rendering.
- Dynamic DOM changes mark affected blocks dirty and requeue them.
- Generated LingoFlow nodes do not trigger duplicate translation loops.
- UI components are excluded by selector, role, interactive density, and direct
  text ratio.
- Translations render inline next to source text using insertion strategies.
- `original`, `dual`, and `translation` modes work without retranslation.
- `page/clear` removes all generated nodes and restores hidden source text.
- `page/clearCache` invalidates both persistent cache and content-runtime
  memory cache.
- Original page content remains intact on provider failure, render failure,
  route change, and clear.
- The full verification suite passes.

## 18. Non-Goals

- Do not render provider HTML.
- Do not request broad host permissions such as `<all_urls>` for this rewrite.
- Do not add new npm dependencies.
- Do not clone a specific third-party translator DOM structure.
- Do not add page-specific selectors as the primary architecture. Site fixtures
  may exist, but the runtime must be driven by semantic filters and adapters.
