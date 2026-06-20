# Google Free Translate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development for every behavior change. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google Free Translate as a built-in selectable provider.

**Architecture:** Implement the provider in `@lingoflow/providers`, add it to default settings, route background extraction by preset id, expose it in options through the existing provider preset UI, and add the narrow MV3 host permission.

**Tech Stack:** TypeScript, Vue 3, Vitest, Playwright, WXT MV3.

---

### Task 1: Provider Contract

**Files:**
- Modify: `packages/types/src/index.ts`
- Modify: `packages/providers/src/index.ts`
- Modify: `packages/providers/src/connection.test.ts`

- [ ] Add failing tests for Google Free request URL construction, response parsing, and connection success.
- [ ] Add `google-free-translate` to built-in presets with no required fields.
- [ ] Implement the provider and register it.
- [ ] Verify provider tests.
- [ ] Commit.

### Task 2: Settings and Background Wiring

**Files:**
- Modify: `packages/settings/src/index.ts`
- Modify: `packages/settings/src/settings.test.ts`
- Modify: `packages/settings/src/summary.test.ts`
- Modify: `apps/extension/entrypoints/background.ts`

- [ ] Add failing tests proving defaults include a configured Google provider.
- [ ] Add the default provider config without making it the default selection.
- [ ] Route Google provider config extraction in background translation.
- [ ] Verify settings/runtime tests.
- [ ] Commit.

### Task 3: UI, Permissions, and E2E

**Files:**
- Modify: `apps/extension/wxt.config.ts`
- Modify: `e2e/preview.spec.ts`
- Modify: `e2e/extension.spec.ts`

- [ ] Add failing preview/E2E assertions for provider visibility and manifest host permission.
- [ ] Add narrow `https://translate.googleapis.com/*` host permission.
- [ ] Verify preview/build tests.
- [ ] Commit.

### Task 4: Full Verification

**Files:**
- Update: `docs/superpowers/plans/2026-06-20-google-free-translate.md`

- [ ] Run `pnpm test`.
- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm build`.
- [ ] Run `pnpm test:e2e`.
- [ ] Mark completion status and skipped gates.
- [ ] Commit.

