# Privacy Policy

## Overview

LingoFlow is a local-first browser extension. It does not operate a backend service, does not collect analytics, and does not track users.

## Data Storage

All user data stays in the browser:

- **API keys** are stored in `chrome.storage.local` and never leave the browser.
- **Translation cache** is stored locally in IndexedDB.
- **User rules** (site rules) are stored in `chrome.storage.local`.
- **Extension settings** are stored in `chrome.storage.local`.
- **Diagnostics** are held in memory for the current page session only. They are not persisted across browser restarts and are never transmitted anywhere.

## Network Requests

LingoFlow makes network requests only to the translation provider configured by the user:

- **Azure Translator** — requests go to `api.cognitive.microsofttranslator.com`.
- **OpenAI-compatible** — requests go to the user-configured base URL (e.g., `api.openai.com`, a self-hosted endpoint, or a local Ollama instance).
- **Google Translate Free (experimental)** — requests go to `translate.googleapis.com`.

No other network requests are made by LingoFlow.

## What Is Sent to Providers

When the user triggers a translation:

- The text content of the current page is sent to the configured provider.
- The user's API key is included in the request header (for Azure and OpenAI-compatible providers).
- Page metadata (URL, title) is **not** sent to the provider.

## What Is Not Collected

LingoFlow does not:

- Collect analytics or telemetry.
- Track page visits or browsing history.
- Send data to any LingoFlow-operated server.
- Use third-party analytics SDKs.
- Store data on remote servers.

## User Control

Users can:

- Clear the translation cache for the current site or all sites at any time.
- Remove their API keys at any time.
- Disable or uninstall the extension at any time.
- Export and delete user rules.

## Third-Party Provider Privacy

When using a third-party translation provider, the provider's own privacy policy applies to the text sent for translation. LingoFlow has no control over how providers handle translated text. Users should review their chosen provider's privacy policy.

## Changes

This privacy policy reflects the current behavior of LingoFlow. If the privacy model changes in a future release, this document will be updated and the changes will be noted in the changelog.
