# Security

## Threat Model

LingoFlow is a BYOK (Bring Your Own Key) browser extension. The primary security concerns are:

1. **API key exposure** — keys must not leak to page scripts, other extensions, or network requests other than the intended provider.
2. **XSS via provider output** — translated text from a provider must not execute as HTML/JS.
3. **Content script isolation** — page content must not access extension APIs or storage directly.
4. **Permission scope** — the extension must request only the permissions it needs.

## API Key Handling

- API keys are stored in `chrome.storage.local`, accessible only to the extension's background service worker.
- API keys are **never** passed to content scripts.
- The background service worker reads provider config and performs all provider API calls.
- Provider connection tests are performed in the background service worker.
- The settings summary exposed to the popup (`getSettingsSummary()`) deliberately excludes API keys.

## Provider Output Rendering

- All provider output is rendered using `textContent` or `innerText`, never `innerHTML`.
- Translated text cannot execute as scripts or inject DOM elements.
- Inline tokens (code, links, URLs) are protected with `⟦LF:N⟧` placeholders during translation and restored after, preventing provider interference with structured content.

## Extension Permissions

LingoFlow requests minimal permissions:

| Permission | Purpose |
|---|---|
| `activeTab` | Access the current tab when the user activates the extension |
| `scripting` | Inject content scripts for translation |
| `storage` | Store settings, API keys, and cache locally |

**Host permissions** (default):

- `https://api.cognitive.microsofttranslator.com/*` — Azure Translator
- `https://api.openai.com/*` — OpenAI API
- `https://translate.googleapis.com/*` — Google Translate Free

**Optional host permissions** (`https://*/*`, `http://*/*`):

- Not granted at install time.
- Requested only when the user saves or tests a custom provider endpoint.
- The extension requests the exact origin of the custom endpoint, not `<all_urls>`.

## Content Script Security

- Content scripts run in an isolated world and cannot access the page's JavaScript context.
- Content scripts do not receive API keys.
- The dev inspector bridge exposes DOM inspection functions (`__lingoflowInspectDom`, `__lingoflowInspectHtml`) for debugging. These are read-only and do not expose provider secrets.

## Local Cache Considerations

- Translation cache is stored in IndexedDB, scoped to the extension.
- Cache keys are based on content hashes, not raw text.
- Cache entries do not include API keys or provider credentials.
- Users can clear cache per-domain or globally.

## Known Limitations

- Provider endpoints (Azure, OpenAI, Google) are third-party services. LingoFlow cannot guarantee the security or privacy practices of these services.
- The experimental Google Translate Free provider uses an undocumented API endpoint and may change behavior without notice.
- If a provider endpoint is compromised, translated text returned to the extension could contain adversarial content, but rendering is limited to `textContent`/`innerText`, which mitigates script injection.

## Reporting Vulnerabilities

If you discover a security vulnerability in LingoFlow:

1. Do **not** open a public GitHub issue.
2. Report the vulnerability privately via email (see repository for contact).
3. Include a description, reproduction steps, and potential impact.
4. Do not include API keys, tokens, or secrets in your report.

## Secrets in Bug Reports

When filing bug reports or sharing diagnostics:

- **Never** include API keys, provider credentials, or tokens.
- Diagnostics output from the inspector does not include provider secrets by design.
- If sharing screenshots, verify that no API keys or sensitive URLs are visible.
