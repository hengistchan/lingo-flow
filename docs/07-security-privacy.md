# 07. Security and Privacy

## Privacy Principles

1. LingoFlow does not operate a translation proxy service in MVP.
2. Webpage text is sent only to the provider selected by the user.
3. API keys are stored locally.
4. API keys are not exposed to content scripts.
5. Translation cache is local.
6. Default permission mode is low-permission.

## API Key Handling

Store provider config in `chrome.storage.local`.

Do not pass API keys to content script.

Background service worker reads provider config and performs provider requests.

## Page Content Handling

Content runtime extracts text blocks from the current page after user action.

Text blocks are sent to background.

Background sends text to the configured provider.

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
    "https://api.openai.com/*"
  ]
}
```

Do not request `<all_urls>` in MVP.

## Future Optional Permissions

If implementing automatic site translation later:

- use optional host permissions
- request explicit site authorization
- maintain site whitelist
- provide clear revoke controls
