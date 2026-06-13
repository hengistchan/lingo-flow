# 09. Acceptance Checklist

## Functional

- [x] Popup opens.
- [x] Options opens.
- [x] Source and target language controls show readable language names instead of language codes.
- [x] Source language defaults to Auto-detect.
- [x] Popup target language overrides only the current page and does not change the saved default.
- [x] Popup shows provider readiness instead of a false Ready state.
- [x] Options sidebar navigation changes the visible settings section.
- [x] User can save target language.
- [x] User can save Azure provider config.
- [x] User can save OpenAI-compatible provider config.
- [x] Provider connection testing runs only after the user explicitly requests it.
- [x] User can click Translate Page.
- [x] Current page text blocks are collected.
- [x] Code/pre/input/nav/footer/header are skipped.
- [x] Translations are rendered below original paragraphs.
- [x] Clear Translation removes inserted nodes.
- [x] Clear Translation does not remove original content.

## Cache

- [x] Translation cache is stored in IndexedDB.
- [x] Same page refresh hits cache.
- [x] Same text with different target language misses cache.
- [x] Same text with different provider misses cache.
- [x] Same text with different OpenAI model misses cache.
- [x] Clear all cache works.
- [x] Clear current domain cache works.
- [x] Cache read failure falls back to provider.
- [x] Cache write failure does not block rendering.

## Provider

- [x] Azure provider protocol works in an installed-extension fixture.
- [x] OpenAI-compatible provider works in an installed-extension fixture.
- [x] Provider config missing shows user-facing error.
- [x] Provider 429 is retried or degraded.
- [x] Provider invalid output does not break the page.

## Degradation

- [x] Failed batch splits.
- [x] Single failed block is marked failed.
- [x] Remaining blocks continue.
- [x] All failed blocks produce a failed page state.
- [x] Mixed successful and failed blocks produce a partial page state.
- [x] Renderer failure for one node does not stop all rendering.
- [x] Optional fallback provider works when configured.

## Security

- [x] API key is stored in `chrome.storage.local`.
- [x] API key is not sent to content script.
- [x] Provider output is rendered with `innerText` or `textContent`.
- [x] Extension does not request `<all_urls>` in MVP.
- [x] No non-public Google/Bing web translate endpoints are used.

## Manual Test Pages

- [x] Wikipedia article
- [x] MDN documentation
- [x] GitHub README
- [x] News article
- [x] Technical blog
- [x] Chinese page
- [x] Page with lots of code blocks

## Remaining Operator Verification

- [ ] Accept and reject a custom provider origin permission prompt in a user-controlled Chrome profile.
- [ ] Run against a live Azure Translator account with operator-provided credentials.
- [ ] Run against a live OpenAI-compatible account with operator-provided credentials.

## Evidence

- Automated installed-extension suite: `pnpm test:e2e`
- Public-page acceptance: `LINGOFLOW_PUBLIC_E2E=1 pnpm exec playwright test e2e/extension.spec.ts --grep "representative public reading pages"`
- Unit and type verification: `pnpm test`, `pnpm typecheck`
