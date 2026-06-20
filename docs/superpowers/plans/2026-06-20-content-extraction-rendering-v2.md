# Content Extraction and Rendering V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development for every behavior change. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full reading-content extraction and placement-aware rendering pipeline for LingoFlow.

**Architecture:** Add a staged DOM pipeline: container discovery, semantic block extraction, overlap dedupe, inline tokenization, and placement-aware rendering. Keep provider output text-only while improving request text and insertion placement.

**Tech Stack:** TypeScript, Vitest, WXT content runtime, browser DOM APIs.

---

### Task 1: GitHub Markdown Regression

**Files:**
- Modify: `packages/dom/src/dom.test.ts`
- Modify: `packages/dom/src/index.ts`

- [ ] Write a failing unit test using the GitHub PR Markdown fixture.
- [ ] Assert headings are collected.
- [ ] Assert `blockquote > p` is collected once and parent `blockquote` is not duplicated.
- [ ] Assert inline `code` text remains part of the paragraph source while code blocks are skipped.
- [ ] Run `pnpm test -- packages/dom/src/dom.test.ts` and verify RED.
- [ ] Implement the smallest collector changes to pass.
- [ ] Run the same test and verify GREEN.
- [ ] Commit.

### Task 2: Container Discovery

**Files:**
- Modify: `packages/dom/src/index.ts`
- Modify: `packages/dom/src/dom.test.ts`

- [ ] Add tests for `.markdown-body`, `article`, `main`, and scored generic containers.
- [ ] Implement `discoverContentRoots`.
- [ ] Keep fallback behavior for simple pages.
- [ ] Verify DOM tests.
- [ ] Commit.

### Task 3: Overlap Dedupe

**Files:**
- Modify: `packages/dom/src/index.ts`
- Modify: `packages/dom/src/dom.test.ts`

- [ ] Add tests for parent/child duplicate text, highly overlapping text, nested list items, and table cells.
- [ ] Implement stable candidate sorting and overlap pruning.
- [ ] Prefer deepest readable leaf except for structural placement boundaries.
- [ ] Verify DOM tests.
- [ ] Commit.

### Task 4: Inline Tokenization

**Files:**
- Modify: `packages/types/src/index.ts`
- Modify: `packages/dom/src/index.ts`
- Modify: `packages/dom/src/dom.test.ts`
- Modify: cache/runtime tests if type changes require updates.

- [ ] Add `InlineToken` and placement metadata to `TextBlock`.
- [ ] Add tests for inline code, links, commit hashes, package names, URLs, and keyboard tokens.
- [ ] Implement protected request text generation.
- [ ] Ensure provider output is still rendered with `textContent`.
- [ ] Verify unit tests and typecheck.
- [ ] Commit.

### Task 5: Placement-Aware Rendering

**Files:**
- Modify: `packages/renderer/src/index.ts`
- Modify: `packages/renderer/src/renderer.test.ts`
- Modify: `packages/runtime/src/index.ts` if render input needs metadata.

- [ ] Add failing tests for paragraph, heading, list item, table cell, quote paragraph, and inline-origin placement.
- [ ] Extend render input with placement metadata.
- [ ] Render list/table translations inside their structural parent.
- [ ] Update existing translation nodes in place.
- [ ] Verify renderer and runtime tests.
- [ ] Commit.

### Task 6: Runtime Integration and E2E

**Files:**
- Modify: `packages/runtime/src/index.ts`
- Modify: `packages/runtime/src/runtime.test.ts`
- Modify: `e2e/extension.spec.ts`

- [ ] Add runtime tests proving placement metadata flows from collected blocks to render input.
- [ ] Add installed-extension fixture for GitHub PR-style Markdown.
- [ ] Verify no duplicate blockquote translation and headings are translated.
- [ ] Run `pnpm test`, `pnpm typecheck`, and `pnpm test:e2e`.
- [ ] Run public-page acceptance if network is available.
- [ ] Commit.
