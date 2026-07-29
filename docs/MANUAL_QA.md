# Manual QA Checklist

Run this checklist before each release or when verifying a significant change.
For a release candidate, repeat it from the extracted Chrome and Edge archives
in separate clean browser profiles and record browser/OS versions.

## Recorded final automated and browser matrix — 2026-07-29

- [x] Unit tests: 498/498 passed
- [x] Type checking passed
- [x] Final Chrome and Edge ZIP packaging and release verification passed
- [x] Bundled Chromium: 48 passed, 1 optional public-page acceptance test
  skipped
- [x] Google Chrome `150.0.7871.187`: 48 passed, 1 optional public-page
  acceptance test skipped
- [x] Microsoft Edge `150.0.4078.105`: 48 passed, 1 optional public-page
  acceptance test skipped

The skipped case requires `LINGOFLOW_PUBLIC_E2E=1`; it was not run and is not
reported as passed.

## Recorded 0.1.0-rc.1 smoke acceptance — 2026-07-29

The Chrome and Edge RC ZIPs were extracted separately and loaded into clean
profiles:

- [x] Google Chrome `150.0.7871.187`: package installed and enabled
- [x] Microsoft Edge `150.0.4078.105`: package installed and enabled
- [x] Default Google translation completed in both browsers
- [x] Starting translation closed the popup in both browsers
- [x] Reopening the popup showed completion and “Add a rule for this page”
- [x] Revealing initially hidden content increased translated blocks from 2 to 4
- [x] No browser-extension or background-service-worker errors were observed

This recorded pass covers the required default-provider RC smoke path. The
unchecked sections below remain reusable extended QA and do not claim that live
Azure, OpenAI-compatible, custom-provider, or every display/cache scenario was
manually exercised in both browsers.

## Installation

- [ ] Load the extracted browser-specific RC ZIP (development checks may use
  `apps/extension/output/chrome-mv3`)
- [ ] Extension icon appears in toolbar
- [ ] No errors in `chrome://extensions` page
- [ ] Popup opens on icon click
- [ ] Manifest shows the intended display and numeric versions
- [ ] No service-worker or extension-page console errors

## Basic Translation Flow

- [ ] Open a normal article page (e.g., a blog post or news article)
- [ ] Click "Translate" in popup
- [ ] Translation appears inline alongside original text
- [ ] Translation completes without console errors
- [ ] Starting translation closes the popup
- [ ] Reopening the popup shows the current live state
- [ ] Click "Clear translation"
- [ ] Original page DOM is fully restored
- [ ] No leftover LingoFlow nodes or attributes

## Display Modes

- [ ] **Original mode** — only source text visible
- [ ] **Dual mode** — source and translation visible
- [ ] **Translation mode** — only translation visible
- [ ] Switching modes does not break layout

## Provider Configuration

- [ ] Open Options > Translation service
- [ ] Select Google Translate Free — no configuration needed
- [ ] Click "Test connection" — succeeds
- [ ] Select Azure Translator — enter endpoint, key, region
- [ ] Click "Test connection" — succeeds with valid key, fails with invalid key
- [ ] Select OpenAI-compatible — enter base URL, key, model
- [ ] Click "Test connection" — succeeds with valid config
- [ ] Save settings — no errors

## Google Free Default

- [ ] Fresh install uses Google Translate Free by default
- [ ] No API key prompt shown for default provider
- [ ] Translation works out of the box

## User Rules

- [ ] Open Options > Site Rules (or Advanced > Site Rules)
- [ ] Add a new user rule with URL pattern and content root selector
- [ ] Rule validates and saves
- [ ] Enable/disable toggle works
- [ ] Edit rule — changes save correctly
- [ ] First Delete click only arms confirmation
- [ ] Second Delete click removes the rule
- [ ] Export rules — downloads JSON file
- [ ] Import rules — validates and adds rules
- [ ] Import rejects invalid rules with clear error messages

## Import/Export

- [ ] Export user rules — JSON file downloads
- [ ] JSON file contains `schema: "lingoflow.userRules.v1"`
- [ ] JSON file does not contain API keys or provider config
- [ ] Import exported file — rules restored correctly
- [ ] Import file with invalid schema — rejected with error

## Page Diagnostics

- [ ] Translate a page
- [ ] Open diagnostics (Options > Site Rules > Test on current page, or inspector)
- [ ] Diagnostics show matched rule ID
- [ ] Diagnostics show block counts (collected, skipped, translated, rendered)
- [ ] Diagnostics show top skip reasons
- [ ] No API keys or secrets in diagnostics output

## Dynamic Translation

- [ ] Dynamic translation defaults to off
- [ ] Enable dynamic translation on a page
- [ ] Scroll to load more content (infinite scroll page)
- [ ] New content is translated after debounce
- [ ] No duplicate translation nodes appear
- [ ] Disable dynamic translation — no new content translated
- [ ] Reveal an article/tab that was hidden during the first scan
- [ ] Revealed content is translated exactly once
- [ ] Hide and reveal it again — no duplicate request or translation appears

## Translation Session Control

- [ ] Start a long translation and click Stop
- [ ] UI reaches cancelled state within 300 ms
- [ ] No new provider requests start after cancellation
- [ ] Loading placeholders are removed after cancellation
- [ ] Already successful translations remain visible
- [ ] A late provider response from the cancelled session is not rendered
- [ ] Reopen the popup — cancelled/partial status is accurate
- [ ] Retry failed items — only failed items are requested
- [ ] Change target language while a request is in flight
- [ ] The previous-language response is not rendered
- [ ] Start translations in two tabs and stop only one
- [ ] The other tab continues and reports its own state

## SPA Route Change

- [ ] Navigate within an SPA (e.g., GitHub navigation)
- [ ] Previous translations are cleared or marked stale
- [ ] If dynamic enabled, new route content is translated
- [ ] If dynamic disabled, popup shows idle/stale status
- [ ] No duplicate translations from previous route

## Infinite Scroll

- [ ] Open an infinite-scroll page (e.g., social media feed)
- [ ] Translate with dynamic enabled
- [ ] Scroll down — new content is translated
- [ ] No duplicate translations
- [ ] No performance degradation after extended scrolling

## Invalid Provider Output

- [ ] Configure a provider that returns malformed output
- [ ] Translate a page
- [ ] Invalid output does not corrupt page DOM
- [ ] Original text remains intact
- [ ] Error is logged in diagnostics

## Cache Behavior

- [ ] Translate a page — translations appear
- [ ] Clear translation
- [ ] Translate same page again — translations use cache (faster)
- [ ] Clear current-site cache in Options
- [ ] Translate again — translations fetched fresh from provider

## Site-Specific Rules

- [ ] **GitHub Markdown** — translate a README or PR description
  - [ ] `.markdown-body` content is translated
  - [ ] Navigation, code blocks, and controls are not translated
- [ ] **Wikipedia** — translate an article
  - [ ] Article content is translated
  - [ ] Navboxes, infoboxes, and references are not translated
- [ ] **Generic docs page** — translate documentation
  - [ ] Main content area is identified and translated
  - [ ] Sidebar and navigation are not translated

## Browser Compatibility

- [x] Works in Chrome `150.0.7871.187`
- [x] Works in Edge `150.0.4078.105`
- [ ] Dark mode renders correctly
- [ ] Extension does not interfere with other extensions
- [ ] Extension does not slow down page loading

## Edge Cases

- [ ] Page with no translatable text — popup shows appropriate message
- [ ] Page with only code blocks — nothing translated, no errors
- [ ] Very long page — translation completes without timeout
- [ ] Page with Shadow DOM — content inside open shadow roots is translated
- [ ] Page with iframes — only main frame content is translated (expected)
