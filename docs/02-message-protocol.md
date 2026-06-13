# 02. Message Protocol

## Purpose

The message protocol connects popup, options, content runtime, and background service worker.

The protocol must be typed and centralized.

## Message Categories

```ts
export type LingoFlowMessage =
  | TranslatePageMessage
  | ClearPageMessage
  | ResolveCacheMessage
  | TranslateBatchMessage
  | ClearCacheByDomainMessage
  | ClearAllCacheMessage
  | GetSettingsMessage
  | SaveSettingsMessage
```

## Popup to Content

```ts
export type TranslatePageMessage = {
  type: 'page/translate'
  payload: {
    tabId: number
  }
}

export type ClearPageMessage = {
  type: 'page/clear'
  payload: {
    tabId: number
  }
}
```

## Content to Background

```ts
export type ResolveCacheMessage = {
  type: 'translation-cache/resolve'
  payload: {
    tasks: TranslationTask[]
  }
}

export type TranslateBatchMessage = {
  type: 'translation/translateBatch'
  payload: {
    tasks: TranslationTask[]
  }
}
```

## Options to Background

```ts
export type GetSettingsMessage = {
  type: 'settings/get'
}

export type SaveSettingsMessage = {
  type: 'settings/save'
  payload: {
    settings: AppSettings
  }
}

export type ClearCacheByDomainMessage = {
  type: 'cache/clearByDomain'
  payload: {
    domain: string
  }
}

export type ClearAllCacheMessage = {
  type: 'cache/clearAll'
}

export type PageClearCacheMessage = {
  type: 'page/clearCache'
}
```

Clearing the current site's cache removes both the background IndexedDB entries
for that domain and the active page content runtime's in-memory cache.

## Standard Response

```ts
export type MessageResponse<T> =
  | {
      ok: true
      data: T
    }
  | {
      ok: false
      error: {
        code?: string
        message: string
      }
    }
```

## Background Listener Pattern

```ts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(data => sendResponse({ ok: true, data }))
    .catch(error => {
      sendResponse({
        ok: false,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      })
    })

  return true
})
```

Always return `true` for async responses.
