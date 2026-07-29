# Changelog

All notable changes to LingoFlow are documented here. The project has not
published a stable release yet.

## [0.1.0-rc.1] - 2026-07-29

The final engineering and packaged-browser gates for this release candidate
have passed. The candidate is ready for an approved tag and GitHub prerelease;
neither that publication action nor any browser-store submission is implied by
this entry.

The packaged candidate passed clean-profile smoke acceptance in Google Chrome
150.0.7871.187 and Microsoft Edge 150.0.4078.105. This is release evidence, not
a claim that a GitHub prerelease or browser-store listing has been published.

Final verification included 498/498 unit tests, type checking, deterministic
ZIP packaging and release verification, plus 48 passed tests and one optional
public-page acceptance test skipped in each of bundled Chromium, Google Chrome
150.0.7871.187, and Microsoft Edge 150.0.4078.105. GitHub private vulnerability
reporting is enabled.

### Added

- Chrome and Edge Manifest V3 builds for inline bilingual web reading.
- Azure Translator, OpenAI-compatible, custom OpenAI-compatible, and
  experimental Google Translate Free providers.
- Local translation cache with provider, language, model, prompt, and
  terminology-aware cache keys.
- Page rules with interactive content-root capture, exclusions, import/export,
  compatibility checks, and diagnostics.
- Scoped terminology management with import/export and protected inline tokens.
- Dynamic translation for newly visible or newly inserted readable content,
  including open Shadow DOM trees.
- Pointer sentence translation through `Alt/Option + Shift + L`.
- Session-scoped page translation with Stop, cancelled/partial status,
  successful-result retention, and retry of failed blocks only.
- Resumable first-run onboarding, bilingual settings, dark mode, and display
  modes for original, bilingual, or translated reading.
- Deterministic Chrome/Edge packaging and automated checks for manifest
  metadata, permissions, archive contents, credentials, and reproducibility.

### Changed

- Page translation now closes the toolbar popup immediately; reopening shows
  the current page state and can stop the active tab's session.
- Provider requests are abortable; cancelled or superseded sessions cannot
  render late results, and cancelling one tab does not affect another.
- Completed translations offer a direct path into page-rule capture.
- Google Translate Free defaults to four concurrent batches and uses a shared
  ceiling of 40 in-flight requests across tabs.
- Translation placeholders and single-line results use reduced-motion-aware
  loading and reveal states.
- Rule and provider removal require a second confirmation.

### Fixed

- Vue reactive page-rule values are detached before browser serialization,
  preventing clone failures during add, edit, copy, and delete operations.
- Generated translation nodes are excluded from diagnostics, rule capture, and
  content-root scoring.
- Hidden content is deferred until visible, and changed source text invalidates
  stale translation results before rendering.
- OpenAI-compatible connection failures retain actionable provider errors
  instead of reporting a false success.

### Security and privacy

- Required permissions remain limited to `activeTab`, `scripting`, and
  `storage`.
- Provider output is rendered as text rather than executable HTML.
- Provider credentials remain in extension storage and are sent only to the
  selected translation endpoint for authentication.
- The extension has no LingoFlow-operated backend, analytics, telemetry, ads,
  or remote executable code.
