# LingoFlow

> AI-powered bilingual web reading browser extension

LingoFlow is a local-first, BYOK (Bring Your Own Key), provider-agnostic browser extension that translates web pages into your target language. Translations are rendered inline alongside the original text, preserving the page structure.

## Features

- **Local-first** — Settings, cache, and runtime state stay in your browser
- **BYOK** — Use your own Azure Translator, OpenAI, or any OpenAI-compatible API key
- **Built-in provider presets** — Azure Translator, OpenAI-compatible (OpenAI/DeepSeek/Qwen/Ollama/LM Studio), and experimental Google Translate Free
- **Custom providers** — Add any OpenAI-compatible endpoint with a custom name
- **Smart caching** — Two-tier cache (memory + IndexedDB) with composite cache keys
- **Resilient** — Automatic retry with exponential backoff, batch splitting on failure, optional fallback provider
- **Inline translations** — Translations rendered inline for headings, inside containers for lists/tables, with proper nesting
- **Inline token protection** — Code, links, and URLs are preserved during translation
- **Shadow DOM support** — Works inside open Shadow DOM trees
- **Dark mode** — Automatic dark theme via `prefers-color-scheme`
- **Privacy-focused** — API keys never leave your browser, no tracking, no analytics

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
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `apps/extension/output/chrome-mv3` directory

### Development

```bash
pnpm dev          # Start dev server with hot reload
pnpm test         # Run unit tests (Vitest)
pnpm test:e2e     # Run E2E browser tests (Playwright)
pnpm typecheck    # Type check all packages
pnpm lint         # Alias for typecheck
```

## Configuration

1. Click the LingoFlow icon in your browser toolbar
2. Click the gear icon to open Settings
3. Go to **Translation service** tab
4. Configure your provider:
   - **Azure Translator** — endpoint, API key, region
   - **OpenAI-compatible** — base URL, API key, model name
   - **Google Translate Free (experimental)** — no configuration needed, not guaranteed stable
   - **Custom** — add any OpenAI-compatible endpoint
5. Click **Test connection** to verify
6. Click **Save settings**

### LLM Speed Controls

For OpenAI-compatible providers, you can control translation speed vs quality:
- **Reasoning effort** — `auto`, `none`, `minimal`, `low`, `medium`, `high`
- **Disable thinking** — turn off chain-of-thought for faster responses

### Translation Concurrency

Control how many translation batches run in parallel (1-10). Higher values are faster but may hit rate limits.

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
  providers/             Azure, OpenAI-compatible, experimental Google Free providers
  scheduler/             Batch scheduling, retry, degradation
  cache/                 IndexedDB translation cache (Dexie)
  settings/              Extension settings management
  testkit/               DOM inspection test utilities
```

### Key Design Decisions

- **Content root discovery** — Finds the main content area (article, main, .markdown-body) before collecting blocks
- **Insertion strategies** — 5 modes: `linebreak-inside`, `inline-inside`, `inside-container`, `before-nested-structure`, `after-block`
- **Inline token protection** — Code/links/URLs replaced with `⟦LF:N⟧` placeholders, restored after translation
- **Provider abstraction** — Providers register by ID, settings store generic `ProviderConfig` with `presetId` routing
- **Settings versioning** — Sequential migration (v0→v1→v2) for forward compatibility

## Tech Stack

- [WXT](https://wxt.dev) — Web Extension Tools
- [Vue 3](https://vuejs.org) with TypeScript
- [Dexie](https://dexie.org) — IndexedDB wrapper
- [Vitest](https://vitest.dev) — Unit testing
- [Playwright](https://playwright.dev) — E2E browser testing

## License

MIT
