# Immersive Insertion Semantics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Attach translations to the correct source text carrier using explicit insertion semantics instead of one generic after-block renderer.

**Architecture:** Extend DOM collection with insertion metadata and text-bearing link classification, then make the renderer execute that metadata with safe `notranslate` wrappers. Preserve the existing text-only provider safety model and existing structural behavior for lists, tables, and blockquotes.

**Tech Stack:** TypeScript, Vitest, WXT content runtime, Playwright installed-extension E2E.

**Status:** Implemented and verified on 2026-06-20. Unit tests passed with 16 files / 103 tests. Typecheck passed. Full installed-extension E2E passed with 18 tests and 1 public-page acceptance test skipped by its `LINGOFLOW_PUBLIC_E2E=1` gate.

---

### Task 1: Contract and Collector Tests

**Files:**
- Modify: `packages/types/src/index.ts`
- Modify: `packages/dom/src/dom.test.ts`
- Modify: `packages/dom/src/index.ts`

- [x] **Step 1: Write failing collector tests**

Add tests for:
- `h3 > a` title links becoming a collected block whose text includes the title.
- text-bearing title links staying in `requestText` instead of being replaced by `[[LF0]]`.
- reference links inside paragraphs still being protected as inline tokens.
- collected blocks exposing insertion metadata.

- [x] **Step 2: Run the focused DOM tests to verify RED**

Run: `pnpm test -- packages/dom/src/dom.test.ts`
Expected: FAIL on missing insertion metadata and/or incorrect link request text.

- [x] **Step 3: Add insertion types and collector metadata**

Add a `TranslationInsertion` type and `meta.insertion` / `meta.carrierTagName`
fields. Keep the metadata stable enough for renderer and runtime integration.

- [x] **Step 4: Implement text-bearing link classification**

Detect primary anchor carriers in heading/title-like blocks and avoid
tokenizing those anchors as references. Keep reference-like anchors protected.

- [x] **Step 5: Run DOM tests to verify GREEN**

Run: `pnpm test -- packages/dom/src/dom.test.ts`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add packages/types/src/index.ts packages/dom/src/index.ts packages/dom/src/dom.test.ts
git commit -m "feat: classify translation insertion semantics"
```

### Task 2: Renderer Strategy Tests and Implementation

**Files:**
- Modify: `packages/renderer/src/renderer.test.ts`
- Modify: `packages/renderer/src/index.ts`

- [x] **Step 1: Write failing renderer tests**

Add tests for:
- `linebreak-inside` inserting a `br` and wrapper inside paragraphs.
- `inline-inside` inserting an inline wrapper inside short headings.
- `linebreak-inside` keeping PR title translations inside anchors.
- `before-nested-structure` preserving parent list placement before child lists.
- `inside-container` preserving table/list container boundaries.
- `clearTranslations` removing wrappers and generated line breaks.

- [x] **Step 2: Run renderer tests to verify RED**

Run: `pnpm test -- packages/renderer/src/renderer.test.ts`
Expected: FAIL because renderer only creates block `div` wrappers.

- [x] **Step 3: Implement strategy-aware wrappers**

Create block and inline wrappers with `notranslate`, `lang`, and
`data-lingoflow-translation`. Use `textContent` for translated text.

- [x] **Step 4: Run renderer tests to verify GREEN**

Run: `pnpm test -- packages/renderer/src/renderer.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/renderer/src/index.ts packages/renderer/src/renderer.test.ts
git commit -m "feat: render translations with insertion strategies"
```

### Task 3: Runtime and E2E Integration

**Files:**
- Modify: `packages/runtime/src/index.ts`
- Modify: `packages/runtime/src/runtime.test.ts`
- Modify: `e2e/extension.spec.ts`

- [x] **Step 1: Write failing runtime/E2E coverage**

Add tests proving insertion metadata flows from collected blocks through
translation tasks to render input. Extend the GitHub fixture with a feed-style
PR title link and assert the translation lands inside the anchor.

- [x] **Step 2: Run targeted tests to verify RED**

Run:
- `pnpm test -- packages/runtime/src/runtime.test.ts`
- `pnpm exec playwright test e2e/extension.spec.ts --grep "GitHub"`

Expected: FAIL where metadata is not passed or title translation is outside the
anchor.

- [x] **Step 3: Pass insertion metadata through runtime**

Add insertion metadata to translation tasks/results or render calls without
changing cache-key semantics unless text normalization changes.

- [x] **Step 4: Run targeted tests to verify GREEN**

Run:
- `pnpm test -- packages/runtime/src/runtime.test.ts`
- `pnpm exec playwright test e2e/extension.spec.ts --grep "GitHub"`

Expected: PASS.

- [x] **Step 5: Run full verification**

Run:
- `pnpm test`
- `pnpm typecheck`
- `pnpm test:e2e`

Expected: PASS, with public-page acceptance still skipped unless
`LINGOFLOW_PUBLIC_E2E=1`.

- [x] **Step 6: Commit**

```bash
git add packages/runtime/src/index.ts packages/runtime/src/runtime.test.ts e2e/extension.spec.ts
git commit -m "feat: align insertion behavior with page text carriers"
```

### Task 4: Completion Notes

**Files:**
- Modify: `docs/superpowers/plans/2026-06-20-immersive-insertion-semantics.md`

- [x] Mark completed tasks.
- [x] Record verification evidence.
- [x] Commit the plan status update.
