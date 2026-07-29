<p align="center">
  <img src="apps/extension/assets/lingoflow-icon.svg" width="96" height="96" alt="LingoFlow icon">
</p>

<h1 align="center">LingoFlow</h1>

<p align="center">
  <strong>AI-powered bilingual web reading browser extension</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Chrome%20%2F%20Edge-MV3-blue?logo=googlechrome" alt="Chrome and Edge MV3">
  <img src="https://img.shields.io/badge/License-MIT-green" alt="MIT License">
  <img src="https://img.shields.io/badge/TypeScript-5.8-blue?logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/Vue-3-42b883?logo=vuedotjs" alt="Vue 3">
  <img src="https://img.shields.io/badge/WXT-0.20-3b82f6" alt="WXT">
</p>

---

LingoFlow is a **local-first**, **BYOK** (Bring Your Own Key), **provider-agnostic** browser extension that translates web pages into your target language. Translations are rendered **inline** alongside the original text, preserving the page structure.

<p align="center">
  <img src="https://img.shields.io/badge/Local--first-No%20Backend%20%7C%20No%20Analytics%20%7C%20No%20Tracking-ff6b6b" alt="Local-first">
</p>

## Features

- **Local-first** — Settings, cache, and runtime state stay in your browser
- **BYOK** — Provider credentials stay in extension storage and are sent only to the provider selected for a translation request
- **Built-in provider presets** — Azure Translator, OpenAI-compatible (OpenAI / DeepSeek / Qwen / Ollama / LM Studio), and experimental Google Translate Free
- **No-key default** — New installs use experimental Google Translate Free by default, works out of the box
- **Custom providers** — Add any OpenAI-compatible endpoint with a custom name
- **Smart caching** — Two-tier cache (memory + IndexedDB) with composite cache keys
- **Resilient** — Automatic retry with exponential backoff, batch splitting on failure, optional fallback provider
- **Inline translations** — Translations rendered inline for headings, inside containers for lists / tables, with proper nesting
- **Inline token protection** — Code, links, and URLs are preserved during translation
- **Shadow DOM support** — Works inside open Shadow DOM trees
- **Dark mode** — Automatic dark theme via `prefers-color-scheme`
- **Privacy-focused** — No LingoFlow backend, tracking, analytics, or advertising; credentials go only to the selected provider
- **User rules** — Define per-site rules for content roots, exclusions, and behavior
- **Diagnostics** — Inspect rule matching, block collection, skip reasons, and translation status
- **Dynamic translation** — Optionally translate new content as it appears (SPA navigation, infinite scroll)
- **Session control** — Stop long translations, preserve completed results, and retry failed blocks without accepting late stale output
- **Pointer sentence translation** — Point to a sentence and press `Alt/Option + Shift + L` to insert its translation directly below the source block

## Installation

### From source

```bash
git clone https://github.com/hengistchan/lingo-flow.git
cd lingo-flow
pnpm install
pnpm build
```

Load `apps/extension/output/chrome-mv3` as an unpacked extension in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `apps/extension/output/chrome-mv3` directory

### Packaged ZIPs

```bash
pnpm package
```

Outputs:

- `apps/extension/output/lingoflow-<version>-chrome-mv3.zip`
- `apps/extension/output/lingoflow-<version>-edge-mv3.zip`
- `apps/extension/output/SHA256SUMS`

The archives are assembled with sorted entries and fixed ZIP metadata, so the
same source tree produces byte-identical packages. Extract the matching archive
and load it as unpacked, or upload it to the corresponding browser store.

## Quick start

1. Click the LingoFlow icon in your browser toolbar
2. Click **Translate to <language>** — done
3. Click the gear icon to open Settings and configure your preferred provider

To translate only the sentence under the mouse, point to it and press
`Alt/Option + Shift + L`. Selected text takes priority when a selection is active.
The active shortcut is shown under **Settings → General** and can be changed in
the browser's extension shortcut manager.

## Development

| Command | Description |
|---|---|
| `pnpm dev` | Start dev server with hot reload |
| `pnpm build` | Chrome MV3 production build |
| `pnpm build:browsers` | Chrome and Edge MV3 production builds |
| `pnpm package` | Clean, build, package, and verify both RC archives |
| `pnpm verify:release` | Verify versions, manifests, permissions, archive contents, secrets, and reproducibility |
| `pnpm test` | Run unit tests (Vitest) |
| `pnpm test:e2e` | Build + run E2E browser tests (Playwright) |
| `pnpm typecheck` | Type check all packages |
| `pnpm lint` | Alias for typecheck |

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for the full development guide.

### Loading unpacked

```bash
pnpm build
# then: chrome://extensions → Load unpacked → apps/extension/output/chrome-mv3
```

## Configuration

1. Click the LingoFlow icon in your browser toolbar
2. Click the gear icon to open Settings
3. Go to **Translation service** tab
4. Configure your provider:
   - **Google Translate Free (experimental)** — default provider, no configuration needed, not guaranteed stable
   - **Azure Translator** — endpoint, API key, region
   - **OpenAI-compatible** — base URL, API key, model name
   - **Custom** — add any OpenAI-compatible endpoint
5. Click **Test connection** to verify
6. Click **Save settings**

### LLM Speed Controls

For OpenAI-compatible providers, you can control translation speed vs quality:

- **Reasoning effort** — `auto`, `none`, `minimal`, `low`, `medium`, `high`
- **Disable thinking** — turn off chain-of-thought for faster responses

### Translation Concurrency

Control how many translation batches run in parallel (1–6). The tested default is 4. Google Translate Free also enforces a shared ceiling of 40 in-flight requests across tabs; values above 4 did not improve its measured throughput.

## User Rules

User rules let you customize per-site translation behavior:

- **Content roots** — CSS selectors for the main content area
- **Exclude selectors** — CSS selectors for areas to skip (navigation, code blocks, etc.)
- **URL patterns** — Wildcard patterns to match specific sites
- **Priority** — Control rule merge order with built-in rules

Rules are stored locally and can be imported/exported as JSON. Built-in rules exist for GitHub Markdown, Wikipedia articles, and documentation pages.

## Diagnostics

After translating a page, diagnostics show:

- Which rule matched
- How many blocks were collected, skipped, translated, and rendered
- Top skip reasons (e.g., "inside ignore selector", "too short")
- Cache hit / miss rates

Access diagnostics via:

- **Options** > **Site Rules** > **Test on current page** (dry-run)
- DevTools console: `__lingoflowGetDiagnostics()` or `__lingoflowPrintDiagnostics()`

## Privacy

LingoFlow is local-first:

- Provider credentials are stored in `chrome.storage.local` and sent only to
  the selected translation endpoint as authentication
- No backend service, no analytics, no tracking
- Translation requests contain page text and language instructions and go only
  to the selected provider; OpenAI-compatible requests also include the current
  page URL and domain as translation context
- Source text, translations, page URL metadata, settings, terminology, and
  rules are stored locally until cleared, pruned, or the extension is removed

See [docs/PRIVACY.md](docs/PRIVACY.md) and [docs/SECURITY.md](docs/SECURITY.md).

## Architecture

Monorepo with pnpm workspaces:

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

See [docs/01-architecture.md](docs/01-architecture.md) for the architecture overview.

## Tech Stack

| Technology | Purpose |
|---|---|
| [WXT](https://wxt.dev) | Web Extension Tools (MV3 build) |
| [Vue 3](https://vuejs.org) | Popup & Options UI |
| [TypeScript](https://www.typescriptlang.org) | Type safety throughout |
| [Dexie](https://dexie.org) | IndexedDB translation cache |
| [Vitest](https://vitest.dev) | Unit testing |
| [Playwright](https://playwright.dev) | E2E browser testing |

## Release status

`0.1.0-rc.1` is the first release-candidate line. It is not a stable release.
Final engineering gates passed: 498/498 unit tests, type checking, final ZIP
packaging and verification, and 48 passed tests with one optional public-page
acceptance test skipped in each of bundled Chromium, Chrome 150.0.7871.187, and
Microsoft Edge 150.0.4078.105. Clean-profile package acceptance also passed in
Chrome and Edge, and GitHub private vulnerability reporting is enabled.

The candidate is published as the
[v0.1.0-rc.1 GitHub prerelease](https://github.com/hengistchan/lingo-flow/releases/tag/v0.1.0-rc.1).
Chrome Web Store and Microsoft Edge Add-ons submissions have not started; their
media, dashboard disclosures, publisher details, and the non-loopback HTTP
custom-provider decision remain store-specific work.

See [RELEASE_NOTES.md](RELEASE_NOTES.md) for the current RC evidence and
[docs/RELEASE.md](docs/RELEASE.md) for the operator procedure.

## Roadmap

After the v0.1 release candidate:

- Harden compatibility against more real-world reading sites
- Improve rule portability and compatibility diagnostics
- Expand accessibility and performance profiling for very long pages
- Evaluate Firefox packaging after the Chromium MV3 release is stable

Current non-goals:

- Cloud sync or backend service
- User accounts or authentication
- Analytics or telemetry
- Remote rule distribution
- Automatic cost analytics

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
