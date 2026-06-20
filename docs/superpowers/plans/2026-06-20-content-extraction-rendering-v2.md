# Content Extraction and Rendering V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development for every behavior change. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full reading-content extraction and placement-aware rendering pipeline for LingoFlow.

**Architecture:** Add a staged DOM pipeline: container discovery, semantic block extraction, overlap dedupe, inline tokenization, and placement-aware rendering. Keep provider output text-only while improving request text and insertion placement.

**Tech Stack:** TypeScript, Vitest, WXT content runtime, browser DOM APIs.

**Status:** Implemented and verified on 2026-06-20. Public-page acceptance remains environment-gated and skipped unless `LINGOFLOW_PUBLIC_E2E=1` is available.

---

### Task 1: GitHub Markdown Regression

**Files:**
- Modify: `packages/dom/src/dom.test.ts`
- Modify: `packages/dom/src/index.ts`

- [x] Write a failing unit test using the GitHub PR Markdown fixture.
- [x] Assert headings are collected.
- [x] Assert `blockquote > p` is collected once and parent `blockquote` is not duplicated.
- [x] Assert inline `code` text remains part of the paragraph source while code blocks are skipped.
- [x] Run `pnpm test -- packages/dom/src/dom.test.ts` and verify RED.
- [x] Implement the smallest collector changes to pass.
- [x] Run the same test and verify GREEN.
- [x] Commit.

### Task 2: Container Discovery

**Files:**
- Modify: `packages/dom/src/index.ts`
- Modify: `packages/dom/src/dom.test.ts`

- [x] Add tests for `.markdown-body`, `article`, `main`, and scored generic containers.
- [x] Implement `discoverContentRoots`.
- [x] Keep fallback behavior for simple pages.
- [x] Verify DOM tests.
- [x] Commit.

### Task 3: Overlap Dedupe

**Files:**
- Modify: `packages/dom/src/index.ts`
- Modify: `packages/dom/src/dom.test.ts`

- [x] Add tests for parent/child duplicate text, highly overlapping text, nested list items, and table cells.
- [x] Implement stable candidate sorting and overlap pruning.
- [x] Prefer deepest readable leaf except for structural placement boundaries.
- [x] Verify DOM tests.
- [x] Commit.

### Task 4: Inline Tokenization

**Files:**
- Modify: `packages/types/src/index.ts`
- Modify: `packages/dom/src/index.ts`
- Modify: `packages/dom/src/dom.test.ts`
- Modify: cache/runtime tests if type changes require updates.

- [x] Add `InlineToken` and placement metadata to `TextBlock`.
- [x] Add tests for inline code, links, commit hashes, package names, URLs, and keyboard tokens.
- [x] Implement protected request text generation.
- [x] Ensure provider output is still rendered with `textContent`.
- [x] Verify unit tests and typecheck.
- [x] Commit.

### Task 5: Placement-Aware Rendering

**Files:**
- Modify: `packages/renderer/src/index.ts`
- Modify: `packages/renderer/src/renderer.test.ts`
- Modify: `packages/runtime/src/index.ts` if render input needs metadata.

- [x] Add failing tests for paragraph, heading, list item, table cell, quote paragraph, and inline-origin placement.
- [x] Extend render input with placement metadata.
- [x] Render list/table translations inside their structural parent.
- [x] Update existing translation nodes in place.
- [x] Verify renderer and runtime tests.
- [x] Commit.

### Task 6: Runtime Integration and E2E

**Files:**
- Modify: `packages/runtime/src/index.ts`
- Modify: `packages/runtime/src/runtime.test.ts`
- Modify: `e2e/extension.spec.ts`

- [x] Add runtime tests proving placement metadata flows from collected blocks to render input.
- [x] Add installed-extension fixture for GitHub PR-style Markdown.
- [x] Verify no duplicate blockquote translation and headings are translated.
- [x] Run `pnpm test`, `pnpm typecheck`, and `pnpm test:e2e`.
- [ ] Run public-page acceptance if network is available. Skipped in the default suite because it is gated by `LINGOFLOW_PUBLIC_E2E=1`.
- [x] Commit.
