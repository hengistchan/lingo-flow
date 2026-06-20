# LLM Translation Speed Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development for every behavior change. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bounded batch concurrency and opt-in LLM reasoning/thinking controls for faster translations.

**Architecture:** Store speed controls in settings, pass concurrency to the content runtime, and keep provider-specific request-body knobs inside the OpenAI-compatible provider. Runtime concurrency is bounded and progress updates remain per completed batch.

**Tech Stack:** TypeScript, Vue 3, Vitest, Playwright, WXT MV3.

**Status:** Implemented and verified on 2026-06-20. Full E2E passed with the public reading pages test still skipped by its environment gate.

---

### Task 1: Settings Contract

**Files:**
- Modify: `packages/types/src/index.ts`
- Modify: `packages/settings/src/index.ts`
- Modify: `packages/settings/src/settings.test.ts`

- [x] Add failing tests for `translationConcurrency` defaults, public runtime exposure, and clamping.
- [x] Add the setting to `AppSettings` and `PublicRuntimeSettings`.
- [x] Merge and clamp stored values to `1..6`.
- [x] Verify `pnpm test -- packages/settings/src/settings.test.ts`.
- [x] Commit.

### Task 2: Runtime Batch Concurrency

**Files:**
- Modify: `packages/runtime/src/index.ts`
- Modify: `packages/runtime/src/runtime.test.ts`

- [x] Add a failing runtime test showing two batches can be in flight before either resolves.
- [x] Implement a bounded async worker over created batches.
- [x] Keep render/progress behavior for success, failed, and cache-hit results.
- [x] Verify runtime tests.
- [x] Commit.

### Task 3: OpenAI-Compatible Speed Request Body

**Files:**
- Modify: `packages/types/src/index.ts`
- Modify: `packages/providers/src/index.ts`
- Modify: `packages/providers/src/connection.test.ts`

- [x] Add failing provider tests for `reasoningEffort` and `disableThinking` request fields.
- [x] Extend OpenAI-compatible config extraction.
- [x] Only send optional fields when configured.
- [x] Verify provider tests.
- [x] Commit.

### Task 4: Options UI Controls

**Files:**
- Modify: `apps/extension/entrypoints/options/App.vue`
- Modify: `packages/shared/src/i18n.ts`
- Modify: `e2e/preview.spec.ts`

- [x] Add a failing preview test for concurrency and OpenAI speed controls.
- [x] Render Advanced concurrency input.
- [x] Render OpenAI-compatible reasoning effort select and disable-thinking checkbox.
- [x] Verify preview E2E.
- [x] Commit.

### Task 5: Full Verification

**Files:**
- Update: `docs/superpowers/plans/2026-06-20-llm-translation-speed-controls.md`

- [x] Run `pnpm test`.
- [x] Run `pnpm typecheck`.
- [x] Run `pnpm build`.
- [x] Run `pnpm test:e2e`.
- [x] Mark plan status with evidence and remaining skipped gates.
- [x] Commit.
