# Changelog

## [1.0.0] - 2026-06-20

### Added

**Core**
- Chrome/Edge Manifest V3 browser extension for bilingual web reading
- Popup UI with language-first interaction design
- Options page with Languages, Providers, Storage, and Advanced sections
- Bilingual UI (Simplified Chinese and English)
- Dark mode support via `prefers-color-scheme`

**Providers**
- Azure Translator provider (REST API v3)
- OpenAI-compatible provider supporting OpenAI, DeepSeek, Qwen, Ollama, LM Studio
- Google Translate Free provider (no API key required)
- Custom OpenAI-compatible provider support
- LLM reasoning effort controls (auto/none/minimal/low/medium/high)
- Provider connection testing without exposing API keys
- Provider presets with dynamic field rendering

**Translation Engine**
- DOM text block collector with content root discovery
- Smart content root scoring for generic pages
- Inline token protection (code, links, URLs preserved during translation)
- 5 insertion strategies: linebreak-inside, inline-inside, inside-container, before-nested-structure, after-block
- Shadow DOM content support
- Text carrier resolution (heading links as translation targets)
- Structural boundary protection (avoid duplicate collection)
- Bounded concurrent batch translation

**Cache**
- Two-tier translation cache (in-memory + IndexedDB)
- Composite cache key (text hash + languages + provider + model + prompt version + normalization version)
- Cache management (clear by domain, clear all, LRU pruning)

**Resilience**
- Automatic retry with exponential backoff (429, 5xx, timeout, network errors)
- Batch split degradation (recursive binary split on failure)
- Optional fallback provider with eligibility-based switching
- Cache read/write failure degradation
- Concurrency protection for simultaneous translations
- Request timeouts (30s) for all provider API calls

**Settings**
- Settings migration versioning (v0 → v1 → v2)
- Current-page target language override without changing saved defaults
- Key-free settings summary for popup
- Translation concurrency setting

**Testing**
- 107 unit tests across 18 test files
- 19 E2E browser tests with real Chromium extension loading
- Public page acceptance tests (Wikipedia, MDN, GitHub, Guardian, WebKit, Chinese Wikipedia, Python docs)
- DOM inspection testkit
- Production build validation (manifest permissions, Unicode noncharacters, inspector bridge)

### Security
- API keys stored only in `chrome.storage.local`
- API keys never sent to content scripts
- Provider output rendered with `textContent` (XSS prevention)
- Minimal permissions: `activeTab`, `scripting`, `storage`
- No `<all_urls>` in default permissions
- Optional host permissions requested only for custom provider endpoints

## [0.1.0] - 2026-06-15

### Added
- Initial MVP with Azure Translator and OpenAI-compatible providers
- Basic popup and options UI
- Translation cache with IndexedDB
- Batch translation with retry and fallback
