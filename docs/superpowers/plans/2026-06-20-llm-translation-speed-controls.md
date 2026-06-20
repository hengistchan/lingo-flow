# LLM Translation Speed Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development for every behavior change. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bounded batch concurrency and opt-in LLM reasoning/thinking controls for faster translations.

**Architecture:** Store speed controls in settings, pass concurrency to the content runtime, and keep provider-specific request-body knobs inside the OpenAI-compatible provider. Runtime concurrency is bounded and progress updates remain per completed batch.

**Tech Stack:** TypeScript, Vue 3, Vitest, Playwright, WXT MV3.

---

### Task 1: Settings Contract

**Files:**
- Modify: `packages/types/src/index.ts`
- Modify: `packages/settings/src/index.ts`
- Modify: `packages/settings/src/settings.test.ts`

- [ ] Add failing tests for `translationConcurrency` defaults, public runtime exposure, and clamping.
- [ ] Add the setting to `AppSettings` and `PublicRuntimeSettings`.
- [ ] Merge and clamp stored values to `1..6`.
- [ ] Verify `pnpm test -- packages/settings/src/settings.test.ts`.
- [ ] Commit.

### Task 2: Runtime Batch Concurrency

**Files:**
- Modify: `packages/runtime/src/index.ts`
- Modify: `packages/runtime/src/runtime.test.ts`

- [ ] Add a failing runtime test showing two batches can be in flight before either resolves.
- [ ] Implement a bounded async worker over created batches.
- [ ] Keep render/progress behavior for success, failed, and cache-hit results.
- [ ] Verify runtime tests.
- [ ] Commit.

### Task 3: OpenAI-Compatible Speed Request Body

**Files:**
- Modify: `packages/types/src/index.ts`
- Modify: `packages/providers/src/index.ts`
- Modify: `packages/providers/src/connection.test.ts`

- [ ] Add failing provider tests for `reasoningEffort` and `disableThinking` request fields.
- [ ] Extend OpenAI-compatible config extraction.
- [ ] Only send optional fields when configured.
- [ ] Verify provider tests.
- [ ] Commit.

### Task 4: Options UI Controls

**Files:**
- Modify: `apps/extension/entrypoints/options/App.vue`
- Modify: `packages/shared/src/i18n.ts`
- Modify: `e2e/preview.spec.ts`

- [ ] Add a failing preview test for concurrency and OpenAI speed controls.
- [ ] Render Advanced concurrency input.
- [ ] Render OpenAI-compatible reasoning effort select and disable-thinking checkbox.
- [ ] Verify preview E2E.
- [ ] Commit.

### Task 5: Full Verification

**Files:**
- Update: `docs/superpowers/plans/2026-06-20-llm-translation-speed-controls.md`

- [ ] Run `pnpm test`.
- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm build`.
- [ ] Run `pnpm test:e2e`.
- [ ] Mark plan status with evidence and remaining skipped gates.
- [ ] Commit.

