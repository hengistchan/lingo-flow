# 01. Architecture

## Summary

LingoFlow is structured as:

```txt
Extension Host
  Popup / Options / Background Service Worker / Content Entrypoint

Content Runtime
  DOM Collector / Translation Planner / Page Task State / Renderer / Memory Cache

Background Runtime
  Settings Gateway / Cache Gateway / Provider Gateway

Provider Layer
  Azure Translator / OpenAI-compatible / Future Providers

Storage Layer
  chrome.storage.local / IndexedDB
```

## Key Architecture Decision

The browser extension is the host. The core product is the **Translation Runtime**.

## Why Content Runtime Owns Page Tasks

Chrome Manifest V3 background scripts are service workers. They can be terminated when idle, so they are not suitable as long-running page translation task managers.

Therefore:

- Content runtime owns page DOM scanning.
- Content runtime owns page-level task state.
- Content runtime owns rendering.
- Background owns provider calls, keys, settings, and persistent cache.

## Runtime Responsibility Matrix

| Runtime | Responsibilities |
|---|---|
| Popup | user trigger, progress display, settings entry |
| Options | settings form, provider config, cache cleanup |
| Content runtime | DOM collection, task creation, render, clear |
| Background service worker | settings, provider calls, IndexedDB cache, message handling |
| IndexedDB | persistent translation cache |
| chrome.storage.local | settings and provider configs |

## Main Translation Flow

```txt
User clicks Translate Page
  -> Popup sends page/translate
  -> Content runtime activates
  -> Collect TextBlock[]
  -> Create TranslationTask[]
  -> Resolve memory cache
  -> Ask background to resolve IndexedDB cache
  -> Render cache hits
  -> Batch translate misses
  -> Background calls provider
  -> Background saves cache
  -> Content runtime renders fresh translations
```

## Clear Translation Flow

```txt
User clicks Clear Translation
  -> Popup sends page/clear
  -> Content runtime removes [data-lingoflow-translation]
  -> Content runtime removes data-lingoflow-block-id
  -> Runtime memory state cleared
```

## Suggested Directory Structure

```txt
lingoflow/
  apps/
    extension/
      entrypoints/
        background.ts
        content.ts
        popup/
          App.vue
        options/
          App.vue
      wxt.config.ts
      package.json

  packages/
    shared/
    types/
    dom/
    runtime/
    renderer/
    providers/
    scheduler/
    cache/
    settings/
```

## Implementation Note

MVP can begin with a simpler `apps/extension/src/*` structure, but each module should preserve clear boundaries.
