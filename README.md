<p align="center">
  <img src="apps/extension/assets/lingoflow-icon.svg" width="96" height="96" alt="LingoFlow icon">
</p>

<h1 align="center">LingoFlow</h1>

<p align="center">
  <strong>AI-powered bilingual web reading browser extension</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Chrome%20MV3-Extension-blue?logo=googlechrome" alt="Chrome MV3">
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
- **BYOK** — Use your own Azure Translator, OpenAI, or any OpenAI-compatible API key
- **Built-in provider presets** — Azure Translator, OpenAI-compatible (OpenAI / DeepSeek / Qwen / Ollama / LM Studio), and experimental Google Translate Free
- **No-key default** — New installs use experimental Google Translate Free by default, works out of the box
- **Custom providers** — Add any OpenAI-compatible endpoint with a custom name
- **Smart caching** — Two-tier cache (memory + IndexedDB) with composite cache keys
- **Resilient** — Automatic retry with exponential backoff, batch splitting on failure, optional fallback provider
- **Inline translations** — Translations rendered inline for headings, inside containers for lists / tables, with proper nesting
- **Inline token protection** — Code, links, and URLs are preserved during translation
- **Shadow DOM support** — Works inside open Shadow DOM trees
- **Dark mode** — Automatic dark theme via `prefers-color-scheme`
- **Privacy-focused** — API keys never leave your browser, no tracking, no analytics
- **User rules** — Define per-site rules for content roots, exclusions, and behavior
- **Diagnostics** — Inspect rule matching, block collection, skip reasons, and translation status
- **Dynamic translation** — Optionally translate new content as it appears (SPA navigation, infinite scroll)

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

### Packaged ZIP

```bash
pnpm package
```

Output: `apps/extension/output/lingoflowextension-<version>-chrome.zip`

Extract and load as unpacked, or upload to the Chrome Web Store.

## Quick start

1. Click the LingoFlow icon in your browser toolbar
2. Click **Translate to <language>** — done
3. Click the gear icon to open Settings and configure your preferred provider

## Development

| Command | Description |
|---|---|
| `pnpm dev` | Start dev server with hot reload |
| `pnpm build` | Production build |
| `pnpm package` | Build + package as distributable ZIP |
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

Control how many translation batches run in parallel (1–10). Higher values are faster but may hit rate limits.

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

- API keys are stored in `chrome.storage.local` and never leave your browser
- No backend service, no analytics, no tracking
- Translation requests go only to your configured provider
- Cache and rules are stored locally

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

## Roadmap / Non-goals

Current non-goals:

- Cloud sync or backend service
- User accounts or authentication
- Analytics or telemetry
- Remote rule distribution
- Glossary or terminology system
- Adaptive batching or cost analytics

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
