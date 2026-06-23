# Manual QA Checklist

Run this checklist before each release or when verifying a significant change.

## Installation

- [ ] Load unpacked extension from `apps/extension/output/chrome-mv3`
- [ ] Extension icon appears in toolbar
- [ ] No errors in `chrome://extensions` page
- [ ] Popup opens on icon click

## Basic Translation Flow

- [ ] Open a normal article page (e.g., a blog post or news article)
- [ ] Click "Translate" in popup
- [ ] Translation appears inline alongside original text
- [ ] Translation completes without console errors
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
- [ ] Delete rule — removed from list
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

- [ ] Works in Chrome (latest stable)
- [ ] Works in Edge (latest stable)
- [ ] Dark mode renders correctly
- [ ] Extension does not interfere with other extensions
- [ ] Extension does not slow down page loading

## Edge Cases

- [ ] Page with no translatable text — popup shows appropriate message
- [ ] Page with only code blocks — nothing translated, no errors
- [ ] Very long page — translation completes without timeout
- [ ] Page with Shadow DOM — content inside open shadow roots is translated
- [ ] Page with iframes — only main frame content is translated (expected)
