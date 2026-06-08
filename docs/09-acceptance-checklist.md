# 09. Acceptance Checklist

## Functional

- [ ] Popup opens.
- [ ] Options opens.
- [ ] User can save target language.
- [ ] User can save Azure provider config.
- [ ] User can save OpenAI-compatible provider config.
- [ ] User can click Translate Page.
- [ ] Current page text blocks are collected.
- [ ] Code/pre/input/nav/footer/header are skipped.
- [ ] Translations are rendered below original paragraphs.
- [ ] Clear Translation removes inserted nodes.
- [ ] Clear Translation does not remove original content.

## Cache

- [ ] Translation cache is stored in IndexedDB.
- [ ] Same page refresh hits cache.
- [ ] Same text with different target language misses cache.
- [ ] Same text with different provider misses cache.
- [ ] Same text with different OpenAI model misses cache.
- [ ] Clear all cache works.
- [ ] Clear current domain cache works.
- [ ] Cache read failure falls back to provider.
- [ ] Cache write failure does not block rendering.

## Provider

- [ ] Azure provider works.
- [ ] OpenAI-compatible provider works.
- [ ] Provider config missing shows user-facing error.
- [ ] Provider 429 is retried or degraded.
- [ ] Provider invalid output does not break the page.

## Degradation

- [ ] Failed batch splits.
- [ ] Single failed block is marked failed.
- [ ] Remaining blocks continue.
- [ ] Renderer failure for one node does not stop all rendering.
- [ ] Optional fallback provider works when configured.

## Security

- [ ] API key is stored in `chrome.storage.local`.
- [ ] API key is not sent to content script.
- [ ] Provider output is rendered with `innerText` or `textContent`.
- [ ] Extension does not request `<all_urls>` in MVP.
- [ ] No non-public Google/Bing web translate endpoints are used.

## Manual Test Pages

- [ ] Wikipedia article
- [ ] MDN documentation
- [ ] GitHub README
- [ ] News article
- [ ] Technical blog
- [ ] Chinese page
- [ ] Page with lots of code blocks
