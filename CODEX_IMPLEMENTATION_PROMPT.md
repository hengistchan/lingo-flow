# Codex Implementation Prompt: LingoFlow MVP

You are implementing **LingoFlow**, an open-source browser extension for bilingual web reading.

## Product Goal

Build a Chrome/Edge Manifest V3 extension that lets users:

1. Configure their own translation provider API key.
2. Open an English webpage.
3. Click the extension popup button.
4. Translate the current webpage into Simplified Chinese.
5. Render translations below original paragraphs.
6. Reopen or refresh the same page and hit the local translation cache.
7. Clear page translations and site/all caches.

## Non-goals for MVP

Do not implement these in MVP:

- PDF translation
- video subtitles
- image OCR
- comic translation
- cloud sync
- user accounts
- glossary
- selection translation
- input box translation
- automatic all-site translation
- remote rules marketplace

## Technology Stack

Use:

- WXT
- Vue 3
- TypeScript
- Chrome Manifest V3
- `chrome.storage.local` for settings
- IndexedDB, preferably Dexie, for translation cache
- Azure Translator as default fast provider
- OpenAI-compatible API as high-quality provider

## Hard Architecture Constraints

1. Do not treat the MV3 background service worker as a long-lived task scheduler.
2. Content runtime owns DOM collection, page task state, and rendering.
3. Background service worker owns provider calls, API keys, settings access, and IndexedDB cache access.
4. Content script must not receive or store provider API keys.
5. Content script should not directly manage long-term IndexedDB cache.
6. Default permission strategy should be low-permission: `activeTab`, `scripting`, `storage`.
7. Do not request `<all_urls>` in MVP.
8. Do not use non-public Google Translate or Bing Translate web endpoints.
9. Use `innerText` or `textContent` to render provider output; never inject provider HTML using `innerHTML`.
10. Cache key must include text hash, source language, target language, provider id, model, prompt version, and normalization version.

## Required MVP Modules

Implement these modules:

```txt
apps/extension/
  entrypoints/
    background.ts
    content.ts
    popup/
      App.vue
    options/
      App.vue

packages/shared/
packages/types/
packages/dom/
packages/runtime/
packages/renderer/
packages/providers/
packages/scheduler/
packages/cache/
packages/settings/
```

You may start with a simpler structure inside `apps/extension/src`, but keep module boundaries clear enough to extract packages later.

## Required Features

### Popup

- Show current status: idle / translating / done / failed.
- Button: Translate Page.
- Button: Clear Translation.
- Link/Button: Open Settings.
- During translation, show progress:
  - total blocks
  - translated blocks
  - cache hits
  - failed blocks

### Options

- General settings:
  - target language
  - render mode: below original
  - cache enabled
  - max cache items
- Provider settings:
  - Azure Translator: endpoint, key, region
  - OpenAI-compatible: base URL, API key, model
  - default provider selection
  - optional fallback provider
- Cache settings:
  - clear all cache
  - clear current site cache if domain is provided

### Content Runtime

- Collect translatable text blocks.
- Generate translation tasks.
- Request cache resolve from background.
- Render cache hits immediately.
- Batch translate misses.
- Render fresh translations.
- Clear translations.

### Background Service Worker

- Read/write settings from `chrome.storage.local`.
- Resolve cache from IndexedDB.
- Save translation cache.
- Call providers.
- Handle message protocol.
- Handle cache cleanup.

## Provider Requirements

Implement:

1. Azure Translator Provider
2. OpenAI-compatible Provider

Provider interface:

```ts
export interface TranslationProvider {
  id: string
  name: string
  type: 'machine-translation' | 'llm' | 'custom'
  capabilities: ProviderCapability

  translate(input: TranslateInput, config: unknown): Promise<TranslateOutput>
  validateConfig?(config: unknown): Promise<boolean>
}
```

## Cache Requirements

Use two cache layers:

1. Content runtime memory cache
2. Background IndexedDB cache

Cache key format:

```txt
translation:{textHash}:{sourceLang}:{targetLang}:{providerId}:{model}:{promptVersion}:{normalizeVersion}
```

IndexedDB table:

```ts
translations:
  &cacheKey, providerId, targetLang, domain, updatedAt, lastUsedAt
```

## Degradation Requirements

MVP must include:

1. Cache read failure -> treat all tasks as misses.
2. Cache write failure -> ignore for current translation result, log warning.
3. Provider failure -> retry.
4. Batch failure -> split batch into smaller batches.
5. Single task failure -> mark failed and continue.
6. Renderer failure -> skip that block and continue.
7. Optional fallback provider -> use when configured and primary provider fails due to timeout / network / rate limit / provider error.

## Acceptance Criteria

The MVP is acceptable when:

1. On Wikipedia, clicking Translate Page inserts Chinese translations under paragraphs.
2. On MDN or GitHub README, code/pre blocks are not translated.
3. Refreshing the same page reuses IndexedDB cache.
4. Switching provider does not reuse old provider cache.
5. Switching target language does not reuse old target language cache.
6. Provider failure does not break the page.
7. Renderer failure for one block does not stop the whole page.
8. API keys are not exposed to content script.
9. Extension does not request `<all_urls>` in MVP.
10. Clear Translation removes all inserted translation nodes.

Follow the documents in `docs/` for detailed implementation design.
