# Development Guide

## Environment Setup

### Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | >= 22 | Required for WXT and ESM modules |
| pnpm | Managed by `packageManager` in `package.json` | Use `corepack enable` or install globally |
| Chrome/Edge | Latest stable | For loading unpacked extension |

### Install

```bash
pnpm install
```

### First Build

```bash
pnpm build
```

Load `apps/extension/output/chrome-mv3` as an unpacked extension.

## Commands

| Command | Description |
|---|---|
| `pnpm dev` | Start WXT dev server with hot reload |
| `pnpm build` | Chrome MV3 production build |
| `pnpm build:chrome` | Chrome MV3 production build |
| `pnpm build:edge` | Edge MV3 production build |
| `pnpm build:browsers` | Chrome and Edge MV3 production builds |
| `pnpm package` | Clean, package, and verify both RC archives |
| `pnpm package:chrome` | Build and deterministically package Chrome |
| `pnpm package:edge` | Build and deterministically package Edge |
| `pnpm verify:release` | Verify release metadata, contents, and reproducibility |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm test:e2e` | Build + E2E tests (Playwright + Chromium) |
| `pnpm typecheck` | Type check all packages |
| `pnpm lint` | Alias for typecheck |

## Architecture

LingoFlow is a monorepo with pnpm workspaces:

```
apps/extension/          Chrome/Edge MV3 extension (WXT + Vue 3)
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
```

### Data Flow

1. **Popup** sends `page/translate` message to background.
2. **Background** injects content script if needed, forwards to content runtime.
3. **Content runtime** resolves page rules, collects DOM blocks, checks cache, schedules provider batches.
4. **Provider** calls go through the background service worker (which holds API keys).
5. **Renderer** inserts translations inline using insertion strategies.
6. **Observer** watches for DOM mutations and route changes for dynamic translation.

### Key Design Decisions

- **Content root discovery** — Finds the main content area (article, main, .markdown-body) before collecting blocks.
- **Insertion strategies** — 5 modes: `linebreak-inside`, `inline-inside`, `inside-container`, `before-nested-structure`, `after-block`.
- **Inline token protection** — Code/links/URLs replaced with `⟦LF:N⟧` placeholders, restored after translation.
- **Provider abstraction** — Providers register by ID, settings store generic `ProviderConfig` with `presetId` routing.
- **Settings versioning** — Sequential migration (v0→v1→v2) for forward compatibility.

## Loading Unpacked Extension

1. Run `pnpm build` (or `pnpm dev` for hot reload).
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select `apps/extension/output/chrome-mv3`.
6. The LingoFlow icon appears in the toolbar.

## Running Tests

### Unit Tests

```bash
pnpm test
```

Tests are colocated with source files (e.g., `rules.test.ts` next to `rules.ts`). Coverage includes:

- Rules: validation, priority, merge, import/export
- Settings: migration, sanitized summaries
- DOM: content roots, block collection, skip reasons
- Renderer: insertion strategies, display modes
- Scheduler: retry, degradation
- Cache: key generation, read/write
- Providers: request formatting, error handling

### E2E Tests

```bash
pnpm test:e2e
```

E2E tests load the real extension in Chromium. They cover:

- Popup rendering and options page
- Translation flow with Google Free default
- Display mode switching
- Provider configuration and connection testing
- Cache behavior
- Site-specific rules (GitHub Markdown)
- Dynamic translation
- Invalid provider output handling

To run the same suite against a branded Chromium browser and an extracted
release package, provide both paths. The harness uses the browser's DevTools
`Extensions.loadUnpacked` command because current Chrome and Edge no longer
honor the old `--load-extension` switch:

```bash
PLAYWRIGHT_EXTENSION_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
PLAYWRIGHT_EXTENSION_DIR="/absolute/path/to/extracted/chrome-package" \
pnpm exec playwright test
```

For Edge, point the two variables at the Edge executable and extracted Edge
package. Every run creates a fresh temporary profile.

### Running Specific Tests

```bash
pnpm exec playwright test --grep "popup"    # Run specific E2E tests
pnpm vitest run --reporter verbose           # Verbose unit test output
```

## Adding a Site Rule

1. Open `packages/rules/src/site-rules.ts`.
2. Add a rule object:

```ts
export const mySiteRule: SiteRule = {
  id: 'my-site',
  version: 1,
  source: 'built-in',
  priority: 20,
  match: {
    matches: ['*://example.com/*'],
    selectorMatches: ['.main-content'],
  },
  selectors: {
    contentRoots: ['.main-content'],
    excludeSelectors: ['.sidebar', '.nav', 'pre', 'code'],
  },
}
```

3. Register it in the site rules array.
4. Add tests in `packages/rules/src/rules.test.ts`.
5. Add an E2E fixture if needed.

## Adding a Provider Preset

1. Implement the provider in `packages/providers/src/`.
2. Implement `translate(texts, config)` and `testConnection(config)`.
3. Register the preset with a stable ID.
4. Add settings fields and connection test button in `apps/extension/entrypoints/options/`.
5. Add unit tests.

Providers must follow BYOK principles: the user supplies their own API key.

## Debugging

### DevTools Inspector

After translating a page, open DevTools and use:

```js
__lingoflowInspectDom()   // Collected DOM blocks and states
__lingoflowInspectHtml()  // Rendered HTML output
```

### Diagnostics

Use Options > Site Rules > Test on current page for a structured dry-run report.

### WXT Dev Mode

```bash
pnpm dev
```

This starts the WXT dev server. Reload the extension from `chrome://extensions` to pick up changes.

## Packaging

```bash
pnpm package
```

Outputs:

- `apps/extension/output/lingoflow-<version>-chrome-mv3.zip`
- `apps/extension/output/lingoflow-<version>-edge-mv3.zip`
- `apps/extension/output/SHA256SUMS`

`pnpm package` first removes old WXT output, builds each browser target, creates
archives with sorted entries and fixed timestamps, and runs the release
verifier. The verifier checks package and manifest versions, permissions,
required files, forbidden source/test files, likely credentials, Unicode
noncharacters, ZIP contents, and byte-for-byte reproducibility.

## Version Management

The user-facing extension version is defined in
`apps/extension/package.json`. The root `package.json` version must match.

Chrome and Edge require one to four numeric version components and use that
value for update ordering. WXT writes the SemVer value to `version_name`, while
LingoFlow maps it to a monotonically increasing four-part manifest version:

- `X.Y.Z-rc.N` → `X.Y.Z.N`, where `N` is 1–99
- `X.Y.Z` → `X.Y.Z.100`

This reserves the stable build after the RC sequence while keeping the
user-facing version conventional.

To bump the version:

1. Update `version` in `apps/extension/package.json`.
2. Update `version` in root `package.json` to match.
3. Update `CHANGELOG.md`.
4. Run `pnpm package` to produce and verify both browser archives.

See [RELEASE.md](./RELEASE.md) for the complete release procedure.
