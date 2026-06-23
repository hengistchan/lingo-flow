# Contributing to LingoFlow

## Prerequisites

- **Node.js** >= 22
- **pnpm** (version managed by `packageManager` field in `package.json`)
- **Chrome** or **Edge** browser (for loading the unpacked extension)

## Setup

```bash
git clone https://github.com/hengistchan/lingo-flow.git
cd lingo-flow
pnpm install
```

## Development

```bash
pnpm dev              # Start dev server with hot reload
pnpm build            # Production build
pnpm test             # Run unit tests (Vitest)
pnpm test:e2e         # Build + run E2E tests (Playwright)
pnpm typecheck        # Type check all packages
pnpm lint             # Alias for typecheck
pnpm package          # Build + package as distributable ZIP
```

## Loading the Extension Locally

1. Run `pnpm build`.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select `apps/extension/output/chrome-mv3`.
5. The LingoFlow icon appears in the toolbar.

## Project Structure

```
apps/extension/          Chrome/Edge MV3 extension (WXT + Vue 3)
  entrypoints/
    background.ts        Background service worker
    lingoflow-content.ts Content script entrypoint
    popup/               Popup UI
    options/             Options/settings UI
  src/
    dev-inspector.ts     DevTools inspector bridge
  assets/                Extension icons
  wxt.config.ts          WXT build configuration
packages/
  types/                 Shared TypeScript types
  shared/                i18n, language catalog, inline tokens, utilities
  dom/                   DOM text block collector with content root discovery
  renderer/              Translation rendering with insertion strategies
  runtime/               Content script translation orchestrator
  providers/             Azure, OpenAI-compatible, Google Free providers
  scheduler/             Batch scheduling, retry, degradation
  cache/                 IndexedDB translation cache (Dexie)
  settings/              Extension settings management
  rules/                 Page rules: built-in site rules, user rules, resolution
  testkit/               DOM inspection test utilities
e2e/                     Playwright E2E tests
docs/                    Architecture, specs, and reference docs
```

## Running Tests

### Unit tests

```bash
pnpm test
```

Unit tests use Vitest and run against the `packages/` workspace. Tests cover rules, settings, DOM collection, renderer, scheduler, cache, and provider logic.

### E2E tests

```bash
pnpm test:e2e
```

E2E tests use Playwright with a real Chromium instance that loads the built extension. Tests cover popup rendering, options page, translation flow, display modes, provider configuration, and site-specific behavior.

### Fixture E2E

E2E tests use local HTML fixtures served by a test server. To run the fixture benchmark deterministically:

```bash
pnpm build && pnpm exec playwright test
```

## Adding a Site Rule

Built-in site rules live in `packages/rules/src/site-rules.ts`. Each rule defines URL matching, content root selectors, exclude selectors, and optional thresholds.

1. Create a rule object with a stable `id`, `version: 1`, `source: 'built-in'`, and a `priority` (lower = higher precedence after default).
2. Add `match.matches` for URL patterns and `match.selectorMatches` for DOM-based matching.
3. Add `selectors.contentRoots` for the main content area and `selectors.excludeSelectors` for non-content areas.
4. Add unit tests in `packages/rules/src/rules.test.ts`.
5. Add an E2E fixture if the site has unique DOM structure.

## Adding a Provider Preset

Provider presets live in `packages/providers/src/`. New providers must follow the local-first, BYOK principle: the user supplies their own API key, and the extension does not bundle or proxy credentials.

1. Implement the provider interface with `translate()` and `testConnection()`.
2. Register the preset with a stable ID.
3. Add settings fields to the options UI.
4. Add unit tests for request formatting and error handling.
5. Do not bypass local-first/BYOK principles: no bundled keys, no proxy services, no analytics.

## Debugging Page Diagnostics

After translating a page:

1. Open DevTools on the translated page.
2. In the console, call `__lingoflowInspectDom()` to see the collected DOM blocks and their states.
3. Call `__lingoflowInspectHtml()` to see the rendered HTML output.
4. Use the extension's diagnostics feature (Options > Site Rules > Test on current page) for a structured dry-run report without calling providers.

## Pull Request Checklist

Before submitting a PR:

- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes
- [ ] `pnpm build` succeeds
- [ ] New code has unit tests
- [ ] No API keys or secrets in the diff
- [ ] No generated build artifacts in the diff
- [ ] Commit messages follow conventional format (e.g., `feat:`, `fix:`, `docs:`, `chore:`)
- [ ] Changes are scoped to the PR's purpose

## Code Style

- TypeScript throughout.
- Vue 3 Composition API with `<script setup>`.
- No runtime dependencies beyond Vue and Dexie.
- Prefer `textContent`/`innerText` over `innerHTML`.
- Prefix DOM attributes with `data-lingoflow-`.
- Prefix CSS classes with `lingoflow-`.

## License

By contributing, you agree that your contributions will be licensed under the project's MIT license.
