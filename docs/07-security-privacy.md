# 07. Security and Privacy

## Privacy Principles

1. LingoFlow does not operate a translation proxy service in MVP.
2. Webpage text is sent only to the provider selected by the user.
3. API keys are stored locally and sent only to the selected provider endpoint
   as authentication.
4. API keys are not exposed to content scripts.
5. Translation cache is local.
6. Default permission mode is low-permission.

## API Key Handling

Store provider config in `chrome.storage.local`.

Do not pass API keys to content script.

Background service worker reads provider config and performs provider requests.

The Options extension page can read provider config so the user can edit it.
Credentials are not sent to the toolbar popup, page content, content scripts,
or diagnostics.

## Page Content Handling

Content runtime extracts text blocks from the current page after user action.

Text blocks are sent to background.

Background sends text to the configured provider.

OpenAI-compatible requests also send the current page URL and domain as model
context. Azure and Google requests do not add that context field. Google
Translate Free includes source text in the HTTPS request URL query.

The local IndexedDB cache can retain raw source and translated text, page URL
and domain metadata, and provider/language metadata until cleared or pruned.

## DOM Safety

Provider output must be rendered with `innerText` or `textContent`.

Do not use `innerHTML` for provider output.

All inserted nodes must use:

```txt
class prefix: lingoflow-
data attribute: data-lingoflow-translation
```

## Permission Strategy

MVP permissions:

```json
{
  "permissions": ["activeTab", "scripting", "storage"],
  "host_permissions": [
    "https://api.cognitive.microsofttranslator.com/*",
    "https://api.openai.com/*",
    "https://translate.googleapis.com/*"
  ],
  "optional_host_permissions": [
    "https://*/*",
    "http://*/*"
  ]
}
```

Do not request `<all_urls>` in MVP.

The optional patterns are not granted at installation. When a user explicitly
saves or tests a custom provider endpoint, LingoFlow requests only that
endpoint's exact origin through `chrome.permissions.request`.

An `http://` custom provider does not encrypt page text or credentials. It
should be used only for a trusted local endpoint; remote endpoints should use
HTTPS.

The detailed user-facing policy and release disclosures are maintained in
[PRIVACY.md](./PRIVACY.md), [SECURITY.md](./SECURITY.md), and
[STORE_LISTING.md](./STORE_LISTING.md).
