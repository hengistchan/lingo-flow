# Site Rules and Real-world Website Stability SPEC

## 1. Background

LingoFlow is a local-first, BYOK, provider-agnostic bilingual reading extension. The current repository already has the core extension shape in place: WXT + Vue 3 MV3 entrypoints, a background service worker for settings/provider/cache gateways, a content runtime for page translation orchestration, DOM collection, renderer strategies, scheduler degradation, IndexedDB cache, and Playwright E2E coverage.

The next meaningful milestone is not another provider. The product risk is whether LingoFlow can remain stable on real websites whose readable content is mixed with navigation, code, controls, feeds, comments, lazy-loaded sections, SPA route changes, tables, nested lists, GitHub Markdown, Wikipedia article structures, and Shadow DOM.

This milestone turns the existing page-rule, diagnostics, observer, DOM, renderer, and E2E primitives into an explicit real-world stability contract.

## 2. Problem Statement

Today, the runtime can translate representative pages, but site compatibility is still mostly implicit:

- `packages/rules/src/site-rules.ts` only defines Wikipedia and GitHub rules, and those rules mostly provide content-root selectors.
- `packages/rules/src/index.ts` already accepts `userRules`, but `packages/settings/src/index.ts`, `apps/extension/entrypoints/options/App.vue`, and `packages/runtime/src/controller.ts` do not persist or pass user-defined rules into runtime resolution.
- `packages/dom/src/index.ts` collects blocks and marks carriers, but it does not expose structured skip reasons or root scoring diagnostics.
- `packages/runtime/src/controller.ts` tracks `PageTranslationProgress`, but progress is aggregate-only and cannot answer which rule matched, which blocks were skipped, or why a rendered result was discarded.
- `packages/runtime/src/observer.ts` has mutation and route-change primitives, but the desired behavior for SPA navigation, infinite scroll, duplicate prevention, stale roots, and current-page language overrides is not yet a product contract.
- `e2e/extension.spec.ts` covers core flows and one GitHub Markdown fixture, plus an opt-in public-page smoke test, but it does not define a fixture benchmark for compatibility regressions.

Without this milestone, real users cannot confidently fix per-site behavior themselves, developers cannot diagnose collector failures quickly, and implementation agents can accidentally improve one page category while regressing another.

## 3. Goals

The milestone must:

- Make built-in site rules a first-class extension point with typed, testable behavior.
- Add user-defined site rules that are local-only, validated before saving, debuggable, importable, and exportable.
- Define deterministic merge and priority behavior for default rules, built-in rules, user rules, and temporary page overrides.
- Expose diagnostics that explain rule matching, content-root selection, collection counts, skip reasons, translation/cache/render status, and runtime failures in user-safe language.
- Stabilize dynamic translation for route changes, DOM mutations, lazy-loaded content, infinite scroll, and partial retranslation.
- Establish a fixture-based compatibility benchmark that runs locally and in CI without public-site flakiness.
- Preserve current provider, cache, settings, popup, and MV3 boundaries.

## 4. Non-goals

This milestone must not:

- Add cloud sync, a backend service, accounts, analytics, or remote rule distribution.
- Prioritize additional translation providers.
- Replace the MV3 extension architecture or move long-running page state into the background service worker.
- Redesign the entire popup/options UI.
- Implement a full glossary or terminology system. Rules may reserve fields that future glossary behavior can use, but glossary behavior is out of scope.
- Implement adaptive provider batching or usage-cost analytics beyond diagnostics counters.
- Fully design release engineering or Chrome Web Store packaging.

## 5. Current Architecture Summary

The architecture described in `docs/01-architecture.md` remains valid:

- Popup: `apps/extension/entrypoints/popup/App.vue` triggers `page/translate`, `page/clear`, `page/status`, and current-site cache cleanup. It should stay focused on the reading task.
- Options: `apps/extension/entrypoints/options/App.vue` owns settings, provider configuration, cache controls, and advanced settings. It is the natural home for rule management.
- Background: `apps/extension/entrypoints/background.ts` owns settings reads/writes, provider calls, persistent cache, and cache clearing. It must continue to avoid page-DOM state.
- Content runtime entrypoint: `apps/extension/entrypoints/lingoflow-content.ts` installs the dev inspector responder and starts `createContentRuntime().start()`.
- Runtime controller: `packages/runtime/src/controller.ts` resolves public runtime settings, resolves page rules, scans, materializes blocks, creates translation tasks, resolves memory/IndexedDB cache, schedules provider work, renders results, and reports aggregate progress.
- Observer: `packages/runtime/src/observer.ts` observes child-list and character-data mutations, detects history route changes, ignores generated LingoFlow mutations, and emits runtime events.
- Render coordinator: `packages/runtime/src/render-coordinator.ts` guards binding presence, staleness, duplicate translations, display mode, and render skips before delegating to renderer strategies.
- DOM collector: `packages/dom/src/index.ts`, `content-root.ts`, `filters.ts`, and `page-adapters.ts` discover roots, query candidate blocks, skip UI/code/generated nodes, tokenize inline content, choose insertion hints, and support open Shadow DOM traversal.
- Renderer: `packages/renderer/src/strategies.ts`, `registry.ts`, and `display-mode.ts` own insertion strategies and source visibility helpers.
- Rules: `packages/rules/src/index.ts` has the default rule, matching, merging, priority sorting, and resolved rule shape. `packages/rules/src/site-rules.ts` currently contains `wikipediaRule` and `githubRule`.
- Providers/scheduler/cache: `packages/providers/src/index.ts`, `packages/scheduler/src/index.ts`, and `packages/cache/src/index.ts` already provide provider abstraction, retry/degrade behavior, batching, and Dexie-backed translation cache.
- Types: `packages/types/src/index.ts` already contains `PageRule`, `ResolvedPageRule`, `RuntimeContext`, `RuntimeEvent`, `RenderSkipReason`, `PageDisplayMode`, `TranslationBlock`, `BlockBinding`, and message types.

## 6. Proposed Product Behavior

Manual translation:

- When the user clicks Translate, the active page uses the resolved rule for the current URL and DOM.
- The popup shows simple reading-task status: ready, translating, complete, partial, failed, no readable text.
- The runtime may collect zero blocks only after diagnostics records which roots were considered and why candidates were skipped.

Site rule matching:

- Every translation run records the resolved rule ID and all contributing rule IDs.
- Normal pages use the default rule plus any matching built-in/user rules.
- Docs pages should prefer content roots such as `main`, `article`, `[role="main"]`, `.prose`, `.md-content`, and docs-specific containers before falling back to scored generic roots.
- GitHub Markdown should match `.markdown-body` and avoid translating surrounding repo navigation, issue controls, PR chrome, file trees, and code blocks.
- Wikipedia article pages should match `#mw-content-text` and `.mw-parser-output`, while Special and Talk pages remain excluded unless a user rule overrides them.
- SPA pages use the resolved rule for the current `location.href` after route changes.
- Dynamic content inherits the current resolved rule unless the route changed and a new rule resolution is required.

Custom site rules:

- Users can create, edit, disable, delete, import, export, and test rules locally.
- Rule testing returns a dry-run diagnostics report without calling providers.
- Invalid selectors, invalid URL patterns, duplicate user rule IDs, or unsupported behavior values must be rejected before saving.
- User rules never require additional host permissions by themselves; translation still uses the active-tab injection and provider permissions model.

Diagnostics:

- Diagnostics answers: which rule matched, which roots were selected, how many blocks were collected, skipped, queued, cache-hit, translated, failed, rendered, skipped at render, stale, or discarded.
- Primary UX copy must be stable and user-safe, such as "Some content was skipped because it looks like page navigation" rather than raw internal errors.
- Developer details can include raw selector names, block IDs, event names, and sanitized error codes.

Dynamic translation:

- When enabled, new readable content is translated after a debounce window and max-wait window.
- Generated LingoFlow nodes are never re-collected.
- Existing translated blocks are not duplicated.
- Stale provider results and stale render attempts are discarded with diagnostics.
- When disabled, route and mutation observation may continue for cleanup/staleness, but new content is not translated until the user manually translates again.

Route changes:

- A history route change creates a new root generation.
- The runtime clears queued work and marks previous unresolved work stale.
- If dynamic translation is enabled, the new route is scanned after debounce and translated using the current page target language.
- If dynamic translation is disabled, the popup should show idle or stale status after route change rather than implying the old page is still fully translated.

Clear translation:

- Clear removes generated nodes, restores hidden source nodes, removes `data-lingoflow-block-id`, clears queue/bindings/store/page memory cache, and restarts observation.
- Persistent IndexedDB cache remains unless the user chooses current-site or all-cache cleanup.

Cache interaction:

- Cache keys continue to be based on text hash, source language, target language, provider, model, prompt version, and normalize version.
- Rule ID must remain task metadata for diagnostics, but should not enter the translation cache key unless a future rule changes the normalized request text.
- Dynamic retranslation should reuse cache for unchanged text across root generations.

Failed or partial translations:

- Invalid provider output must not corrupt the page.
- Partial success renders successful blocks, records failed blocks with sanitized reasons, and leaves original page content intact.
- A failed render should not count as a translated/rendered block, even if provider translation succeeded.

## 7. Site Rule Model

The rule model extends the existing `PageRule` shape in `packages/types/src/index.ts`, but the spec separates bundled rules from persisted user-authored rules.

```ts
type SiteRule = {
  id: string
  version: number
  source: 'built-in'
  description?: string
  priority: number
  match: {
    matches?: string[]
    excludeMatches?: string[]
    selectorMatches?: string[]
    excludeSelectorMatches?: string[]
  }
  selectors: {
    contentRoots?: string[]
    blockSelectors?: string[]
    excludeSelectors?: string[]
    inlineSelectors?: string[]
    preserveSelectors?: string[]
    atomicBlockSelectors?: string[]
    stayOriginalSelectors?: string[]
  }
  thresholds?: {
    minTextLength?: number
    minWordCount?: number
    maxInteractiveElements?: number
    minRootTextLength?: number
    minRootParagraphCount?: number
    linkDensityPenalty?: number
  }
  behavior?: {
    translationArea?: 'main' | 'body' | 'selection'
    startMode?: 'manual' | 'dynamic' | 'immediate'
    displayMode?: 'original' | 'dual' | 'translation'
    translationPosition?: 'after' | 'before'
    translationTheme?: 'system' | 'light' | 'dark'
    defaultInsertion?: TranslationInsertion
  }
}

type UserSiteRule = Omit<SiteRule, 'source'> & {
  source: 'user'
  enabled: boolean
  createdAt: string
  updatedAt: string
}
```

Validation rules:

- `id` is required, stable, lower-case, and limited to letters, numbers, dots, underscores, and hyphens.
- Built-in IDs use unprefixed stable names such as `github-markdown` and `wikipedia-article`.
- User IDs must be stored with a `user:` namespace internally if they collide with built-ins.
- `SiteRule` represents bundled built-in rules and does not require `enabled`; disabling built-ins is out of scope unless the product explicitly adds that setting.
- `UserSiteRule` represents persisted local user-authored rules and must include `enabled`, `createdAt`, and `updatedAt`.
- `matches` and `excludeMatches` use the current wildcard URL pattern behavior from `matchesWildcardUrl()`.
- Selectors must parse through `document.createDocumentFragment().querySelector(selector)` or equivalent safe validation before saving.
- Empty selector arrays are allowed only when inherited defaults are sufficient.
- Thresholds must be finite positive numbers within documented limits.
- Behavior enums must reject unknown values.
- For this milestone, `behavior.startMode` is a rule recommendation field only. It must not automatically enable dynamic translation by rule.
- Rules that have neither URL nor selector matching are allowed only as explicit runtime overrides, not persisted user rules.

Merge and priority rules:

- Resolution order is: `defaultPageRule`, matching built-in rules by ascending priority, matching enabled user rules by ascending priority, temporary runtime overrides.
- Later rules override scalar behavior and threshold fields.
- Selector arrays merge by de-duplicating while preserving intent:
  - `contentRoots`: more specific incoming roots are prepended so user/custom roots win discovery order.
  - `blockSelectors`, `excludeSelectors`, `inlineSelectors`, `preserveSelectors`, `atomicBlockSelectors`, and `stayOriginalSelectors`: incoming selectors append unless the existing resolver explicitly defines a safer precedence.
- The resolved rule records `id`, `matchedRuleIds`, selector fields, behavior fields, threshold fields, and `ruleSourceSummary`.
- Disabled user rules are ignored but remain exportable.

Persistence:

- `AppSettings` gains `userRules: UserSiteRule[]` and a settings migration version bump.
- `userRules` is the persisted local user-authored rule list.
- `siteRules` refers only to built-in site rules passed into rule resolution.
- `getPublicRuntimeSettings()` returns enabled user rules only. It must not expose provider keys or secrets.
- User rules are stored in `chrome.storage.local` with other settings, preserving local-first behavior.

Import/export:

- Export format is JSON:

```json
{
  "schema": "lingoflow.userRules.v1",
  "exportedAt": "2026-06-22T00:00:00.000Z",
  "rules": [
    {
      "id": "user:example-docs",
      "version": 1,
      "enabled": true,
      "createdAt": "2026-06-22T00:00:00.000Z",
      "updatedAt": "2026-06-22T00:00:00.000Z",
      "priority": 50,
      "match": { "matches": ["https://example.com/docs/*"] },
      "selectors": { "contentRoots": ["main.docs"], "excludeSelectors": [".sidebar"] }
    }
  ]
}
```

- Import validates the full file before saving any rule.
- Import can add new rules, replace matching user IDs, or skip duplicates based on explicit user choice.
- Export must not include provider settings, cache data, API keys, or diagnostics history.

Examples:

```ts
{
  id: 'github-markdown',
  version: 1,
  source: 'built-in',
  priority: 20,
  match: {
    matches: ['*://github.com/*'],
    selectorMatches: ['.markdown-body'],
  },
  selectors: {
    contentRoots: ['.markdown-body'],
    excludeSelectors: [
      '.file-navigation',
      '.js-comment-form',
      '.timeline-comment-actions',
      'pre',
      'code',
    ],
  },
}
```

```ts
{
  id: 'wikipedia-article',
  version: 1,
  source: 'built-in',
  priority: 20,
  match: {
    matches: ['*://*.wikipedia.org/wiki/*'],
    excludeMatches: ['*://*.wikipedia.org/wiki/Special:*', '*://*.wikipedia.org/wiki/Talk:*'],
    selectorMatches: ['#mw-content-text'],
  },
  selectors: {
    contentRoots: ['#mw-content-text', '.mw-parser-output'],
    excludeSelectors: ['.navbox', '.infobox', '.reference', '.mw-editsection'],
  },
}
```

## 8. Runtime / DOM / Renderer Contract

Rules resolver:

- `resolvePageRule(document, url, { siteRules, userRules, overrides })` remains pure and deterministic.
- It returns a `ResolvedPageRule` that is serializable and safe to include in diagnostics.
- It does not inspect provider settings, cache, or runtime state.

DOM collector:

- `collectScanResults(root, context)` consumes `RuntimeContext.pageRule`.
- It must return `ScanResult[]` and a diagnostics payload for content roots, candidate counts, accepted blocks, and skip reasons.
- It must not call providers, cache, background messages, or renderer APIs.
- It must continue marking accepted carriers with `data-lingoflow-block-id`, but generated nodes and ignored selectors must never be accepted.

Runtime controller:

- `RuntimeController` owns page runs, dynamic mode, current page target override, aggregate progress, block state, and diagnostics snapshots.
- Full manual translation starts a new run and clears generated nodes first.
- Incremental translation starts a new run only for the new root generation, preserves successful existing rendered blocks where valid, and reuses cache.
- Runtime state changes emit typed `RuntimeEvent` entries suitable for diagnostics.

Observer:

- `PageObserver` ignores LingoFlow-generated mutations.
- Child-list mutations trigger debounced new-content events.
- Character-data mutations mark known bindings dirty.
- Route changes increment root generation and emit `observer:newContent` with `cause: 'route-change'`.
- Shadow DOM support must include open roots discovered during scan and mutation handling where feasible.

Render coordinator:

- `RenderCoordinator.renderTranslation()` remains the gate for missing bindings, detached elements, staleness, same-text, duplicate translations, unsupported strategies, and display-mode behavior.
- Every render skip emits a diagnostic reason.
- Display mode changes must not hide generated translations by hiding an ancestor that contains them.
- Renderer strategies remain pure DOM insertion/revert helpers and must not know about settings, cache, providers, or popup state.

Cache:

- Memory cache stays page-local inside `RuntimeController`.
- IndexedDB cache stays in `packages/cache` and background mediation.
- Cache hits and misses are recorded per block and aggregated in diagnostics.

Popup/options UI:

- Popup requests current status and optionally a compact diagnostics summary.
- Options manages rule settings, import/export, validation, and dry-run diagnostics.
- A developer inspector can expose detailed event/block diagnostics without putting that detail in the main popup.

## 9. Message Protocol Changes

Existing message response shape remains:

```ts
type MessageResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code?: string; message: string } }
```

New settings/background messages:

```ts
type UserRulesGetMessage = {
  type: 'userRules/get'
}

type UserRulesSaveMessage = {
  type: 'userRules/save'
  payload: {
    rules: UserSiteRule[]
  }
}

type UserRulesValidateMessage = {
  type: 'userRules/validate'
  payload: {
    rule: UserSiteRule
  }
}

type UserRulesImportMessage = {
  type: 'userRules/import'
  payload: {
    document: UserRulesExportDocument
    mode: 'add' | 'replace' | 'skip-duplicates'
  }
}

type UserRulesExportMessage = {
  type: 'userRules/export'
}
```

New page/runtime messages:

```ts
type PageGetDiagnosticsMessage = {
  type: 'page/getDiagnostics'
  payload?: {
    includeBlocks?: boolean
    includeEvents?: boolean
    maxEvents?: number
  }
}

type PageDiagnoseMessage = {
  type: 'page/diagnose'
  payload?: {
    ruleOverride?: PageRule
    includeSkipped?: boolean
  }
}

type PageSetDynamicTranslationMessage = {
  type: 'page/setDynamicTranslation'
  payload: {
    enabled: boolean
  }
}
```

Example diagnostics response:

```json
{
  "rule": {
    "id": "github-markdown",
    "matchedRuleIds": ["default", "github-markdown"],
    "source": "built-in"
  },
  "url": "https://github.com/org/repo/pull/1",
  "rootGeneration": 2,
  "dynamicTranslationEnabled": true,
  "counts": {
    "rootsConsidered": 5,
    "rootsSelected": 1,
    "candidates": 42,
    "collected": 18,
    "skipped": 24,
    "queued": 0,
    "cacheHit": 7,
    "translated": 11,
    "failed": 0,
    "rendered": 18,
    "renderSkipped": 0,
    "stale": 0
  },
  "topSkipReasons": [
    { "reason": "inside-ignore-selector", "count": 10 },
    { "reason": "too-short", "count": 8 }
  ],
  "userMessageCode": "diagnostics_ok"
}
```

Protocol requirements:

- `page/getDiagnostics` must be served by content runtime because it owns the latest live block/binding/event diagnostics snapshot.
- `page/diagnose` must run dry-run diagnostics: resolve rules and collect DOM diagnostics without provider calls, cache writes, persistent DOM mutation, or generated translation nodes.
- If `page/diagnostics` or `page/ruleDryRun` already exist in an implementation branch, they may remain as compatibility aliases for `page/getDiagnostics` and `page/diagnose`.
- `userRules/*` messages must be served by background/settings because user rules are persisted in `chrome.storage.local`.
- Built-in `siteRules` are bundled code data, not persisted settings.
- Message payloads must remain serializable across MV3 boundaries.
- Raw provider errors can appear in developer detail, but primary UI must use sanitized `messageCode` values.

## 10. UI / UX Requirements

Popup:

- Keep the primary popup focused on translate, target language, progress, clear translation, and current-site cache cleanup.
- Add at most a compact diagnostics affordance, such as a small status/detail button, only after a translation has run or failed.
- Do not show raw selectors, stack traces, or long event logs in the primary popup surface.

Options:

- Add a Site rules section or Advanced subsection with:
  - list of built-in matched rule examples, read-only;
  - user rule list with enable/disable, edit, duplicate, delete;
  - import/export actions;
  - validation errors before save;
  - "Test on current page" action that returns a dry-run report.
- Rule editor should favor structured fields for URL patterns, content roots, excludes, thresholds, and behavior. A JSON editor may exist for advanced users, but validation must still be structured.

Developer inspector:

- Extend the existing inspector bridge in `apps/extension/src/dev-inspector.ts` so DevTools users can call a diagnostics function in addition to DOM inspection.
- The console-facing API should return both structured JSON and a printed summary.
- The bridge must remain available in non-dev builds if the user has injected the content runtime, consistent with existing inspector behavior.

Primary copy:

- Use safe message codes such as `no_readable_text`, `rule_no_content_root`, `provider_failed`, `partial_translation`, `dynamic_paused`, and `diagnostics_available`.
- Developer details may include internal codes such as `inside-ignore-selector`, `render:skipped/duplicate`, or `translation:discarded/stale`.

## 11. Diagnostics Model

Diagnostics must be a structured snapshot, not only console logs.

```ts
type PageDiagnostics = {
  pageUrl: string
  domain: string
  runId: string
  rootGeneration: number
  rule: {
    id: string
    matchedRuleIds: string[]
    selectors: ResolvedPageRule['selectors']
    thresholds: ResolvedPageRule['thresholds']
    behavior: ResolvedPageRule['behavior']
  }
  dynamicTranslationEnabled: boolean
  displayMode: PageDisplayMode
  counts: DiagnosticCounts
  roots: RootDiagnostic[]
  blocks?: BlockDiagnostic[]
  events?: RuntimeEvent[]
  userMessageCode?: string
}
```

Block-level diagnostic fields:

- `blockId`
- `revision`
- `state`
- `textLength`
- `blockType`
- `tagName`
- `carrierTagName`
- `insertion`
- `rootKind`
- `rootGeneration`
- `cacheStatus: 'memory-hit' | 'indexeddb-hit' | 'miss' | 'disabled'`
- `translationStatus: 'not-requested' | 'requested' | 'success' | 'failed' | 'discarded'`
- `renderStatus: 'not-rendered' | 'rendered' | 'skipped'`
- `skipReason?: CollectionSkipReason | RenderSkipReason | StalenessReason | DegradeReason`
- `safeMessageCode?: string`

Collection skip reasons must include at least:

- `inside-ignore-selector`
- `inside-ui-exclusion`
- `generated-node`
- `already-bound`
- `not-visible`
- `too-short`
- `too-many-interactive-elements`
- `structural-parent-accepted`
- `block-level-children`
- `table-cell-too-interactive`
- `content-root-threshold`

Diagnostics retention:

- Keep the latest diagnostics snapshot in content runtime memory.
- Keep a bounded event ring buffer per page run, default 500 events.
- Do not persist diagnostics across browser restarts.
- Do not include provider API keys, request headers, or full provider raw payloads.

## 12. Dynamic Translation Behavior

For this milestone, dynamic translation defaults to off globally and can be enabled per page. Site rules may reserve a field for recommended dynamic behavior, but automatic enablement by rule is out of scope until the compatibility benchmark is stable.

Dynamic mode states:

- Disabled: observe for cleanup/staleness only; do not translate newly added content automatically.
- Enabled: translate newly added readable content after debounce.
- Route-pending: route changed, root generation advanced, queued work cleared, waiting for debounce.
- Paused: temporarily suppress dynamic scanning while manual translation is running.

Debouncing:

- Child-list additions debounce for 500 ms with a 1000 ms max wait, matching the current shape in `PageObserver.scheduleNewContent()`.
- Character-data mutations debounce for 80 ms, matching `PageObserver.scheduleDirty()`.
- Large churn may collapse to a root-level rescan with `cause: 'large-churn'`.

Root generation:

- Each manual full-page translate and route change belongs to a root generation.
- Route change increments root generation before new scans.
- New content without route change uses the current root generation.
- Provider results must include run ID and root generation metadata. Results whose block version no longer matches are discarded and diagnosed.

Duplicate prevention:

- Block identity must distinguish translation/cache identity from DOM-instance identity.
- `textHash` remains the translation reuse identity and the input to cache identity.
- `blockId` must be stable for a concrete DOM source instance within a runtime generation, not only derived from `textHash`.
- Repeated identical text in different page locations must produce distinct block IDs but share the same cache key when source language, target language, provider, model, prompt version, and normalize version match.
- A block ID may be derived from `textHash + sourceSignature + occurrenceIndex + rootGeneration`, as long as it is deterministic within one scan.
- Duplicate render detection must use the DOM-instance `blockId`, while cache reuse must use `textHash`.
- Generated nodes with `data-lingoflow-generated`, `data-lingoflow-translation`, `data-lingoflow-translation-break`, or `data-lingoflow-translation-spacer` are excluded from collection and observer triggers.
- Render coordinator must preserve its existing duplicate check for `[data-lingoflow-translation="${blockId}"]` and record diagnostics when it fires.

Partial retranslation:

- Dirty known blocks remove their rendered nodes, update revision, requeue, and reuse cache when the normalized text hash is unchanged.
- New blocks translate once.
- Removed blocks remove bindings and version entries.
- Failed blocks may be retried by manual Translate again or by dynamic retry only if the source block changes.

Current-page target language overrides:

- A popup-selected target language for the current page applies to manual and dynamic translations for that page until the user changes it, clears the page, reloads, or the content runtime restarts.
- The override must not change saved settings, matching existing E2E expectations in `e2e/extension.spec.ts`.
- Dynamic translations must use the current page target override, not silently fall back to saved default target language.

## 13. Testing Strategy

Unit tests:

- `packages/rules/src/rules.test.ts`: validation, priority, built-in/user merge, disabled rules, collision handling, import/export schema, selector parsing.
- `packages/settings/src/settings.test.ts`: migration for `userRules`, sanitized public runtime settings, import/export persistence.
- `packages/dom/src/dom.test.ts`: rule-driven content roots, block selectors, exclude selectors, skip reasons, root scoring diagnostics, generated-node exclusion.
- `packages/runtime/src/*`: diagnostics snapshots, event ring buffer, dynamic state transitions, route generation, stale result discard, current-page target override with dynamic mode.
- `packages/renderer/src/renderer.test.ts`: display mode and hidden-source behavior, no duplicate translation nodes, revert/clear behavior.

Fixture E2E benchmark:

- Create local fixtures under an E2E fixture server rather than relying on public websites.
- Categories:
  - article page;
  - docs page;
  - GitHub Markdown;
  - Wikipedia-like article;
  - nested lists;
  - tables;
  - code-heavy pages;
  - open Shadow DOM;
  - SPA route change;
  - infinite scroll;
  - partially interactive pages.

Required assertions:

- No duplicate translations after Translate again.
- Clear restores original DOM and removes generated nodes.
- Display modes `original`, `dual`, and `translation` work without hiding translations incorrectly.
- Invalid provider output does not corrupt source DOM.
- Dynamic content is translated once.
- Generated nodes are not re-collected.
- Code/pre/kbd/preserve selectors stay untranslated.
- Link/code inline tokens restore without `LF` placeholders leaking.
- Diagnostics reports matched rule, counts, and top skip reasons.
- Current-page target override is respected by dynamic translation and not saved globally.

CI:

- Existing `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` remain required.
- Public-page E2E can remain opt-in via `LINGOFLOW_PUBLIC_E2E=1`, but fixture benchmark must be deterministic enough for CI.

## 14. Migration / Compatibility

Settings:

- Existing settings migrate by adding `userRules: []`.
- `userRules` is the persisted local user-authored rule list.
- `siteRules` refers only to built-in site rules passed into runtime resolution.
- Provider configs and API keys must remain unchanged.
- `getSettingsSummary()` should not expose site rule internals unless a compact current-page rule summary is explicitly needed by popup.

Rules:

- Existing built-in `wikipediaRule` and `githubRule` behavior must continue to pass current tests.
- Built-in rule IDs may be renamed only with compatibility aliases in tests and diagnostics, or the existing IDs should remain.
- `resolvePageRule()` should remain backward-compatible for callers that pass only `siteRules`.

Messages:

- Existing `page/translate`, `page/clear`, `page/status`, `page/clearCache`, `translation-cache/resolve`, and `translation/translateBatch` behavior remains compatible.
- Existing `page/enableDynamicTranslation` and `page/disableDynamicTranslation` may remain as aliases for `page/setDynamicTranslation`.

DOM and renderer:

- Existing generated-node attributes remain supported.
- Existing cache keys remain valid.
- Existing inspector functions `window.__lingoflowInspectDom()` and `window.__lingoflowInspectHtml()` remain available.

Tests:

- Existing E2E expectations for Google Free default, current-page target override, cache reuse, invalid output, Azure fallback, GitHub Markdown placement, and production manifest permissions must continue to pass.

## 15. Acceptance Criteria

- [ ] The default rule covers generic readable web pages.
- [ ] Built-in site rules cover docs pages, GitHub Markdown, and Wikipedia-like articles with explicit selectors, thresholds, behavior, and tests.
- [ ] User rules are stored locally in settings, migrated from existing settings, validated before save, and exposed to runtime through sanitized public settings.
- [ ] User rules can be enabled, disabled, edited, deleted, imported, exported, and dry-run tested without provider calls.
- [ ] Rule resolution deterministically merges default, built-in, user, and override rules, and diagnostics records all matched rule IDs.
- [ ] DOM collection returns diagnostics for roots, candidates, accepted blocks, and skip reasons.
- [ ] Runtime diagnostics reports block counts for collected, skipped, queued, cache-hit, translated, failed, rendered, render-skipped, stale, and discarded states.
- [ ] Repeated identical text in different DOM locations receives distinct block IDs but shares translation cache through the same `textHash`-based cache key when source language, target language, provider, model, prompt version, and normalize version match.
- [ ] Popup remains focused on the primary reading workflow and does not expose raw internal errors as primary UX copy.
- [ ] Options exposes rule management and dry-run diagnostics.
- [ ] Developer inspector exposes structured diagnostics and a printed summary from the active page.
- [ ] Dynamic translation defaults to off globally, can be enabled per page, and is not automatically enabled by site rule behavior.
- [ ] Dynamic translation handles DOM mutations, route changes, lazy-loaded content, and infinite scroll without duplicate translation nodes.
- [ ] Current-page target language overrides are honored by dynamic translation and are not saved globally.
- [ ] Clear translation restores source DOM, removes generated nodes and block IDs, clears page runtime stores, queues, bindings, diagnostics, and page memory cache. It must not clear persistent IndexedDB translation cache unless the user explicitly requests cache cleanup.
- [ ] Generated LingoFlow nodes are never re-collected or treated as new readable content.
- [ ] Invalid provider output and render skips do not corrupt source DOM.
- [ ] Fixture-based E2E benchmark covers article, docs, GitHub Markdown, Wikipedia-like, nested lists, tables, code-heavy, Shadow DOM, SPA route change, infinite scroll, and partially interactive pages.
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm build`, and deterministic `pnpm test:e2e` pass.

## 16. Open Questions

- Should user rules live in a dedicated Options section or under Advanced for the first release of this milestone?
- Should built-in rules be user-disableable, or should users override them with higher-priority user rules while built-ins remain always available?
- Should diagnostics event buffers be exposed only through the developer inspector, or should Options also show recent active-page diagnostics?
- Should rule import replace by exact ID only, or also detect equivalent URL pattern collisions?
