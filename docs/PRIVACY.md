# Privacy Policy

Last updated: 2026-07-29

## Overview

LingoFlow is a local-first browser extension for translating web page text
inline. It has no LingoFlow-operated backend, analytics, advertising, or
tracking. It does, however, handle website content and send selected text to
the translation provider chosen by the user. This policy describes that local
processing and provider transmission.

## Data stored in the browser

LingoFlow stores the following data in the extension profile:

- **Provider configuration and credentials** in `chrome.storage.local`.
- **Settings and onboarding progress** in `chrome.storage.local`.
- **User site rules and terminology lists** in `chrome.storage.local`.
- **Translation cache entries** in IndexedDB. An entry can include source and
  normalized text, translated text, the page URL and domain, language and
  provider identifiers, model and prompt metadata, terminology semantics, and
  timestamps.
- **Page diagnostics and active translation state** in memory for the current
  page session.

This data is not synchronized by LingoFlow and is not sent to a
LingoFlow-operated service.

## Network requests

LingoFlow makes translation or connection-test requests only after a user
chooses or tests a translation provider:

- **Azure Translator** — `api.cognitive.microsofttranslator.com` by default.
- **OpenAI-compatible** — the configured base URL, such as `api.openai.com`, a
  self-hosted service, or a local Ollama/LM Studio endpoint.
- **Google Translate Free (experimental)** —
  `translate.googleapis.com`.
- **Custom provider** — the exact origin approved by the user.

The extension declares broad optional HTTP and HTTPS host patterns so it can
request the exact custom-provider origin selected by the user. Those optional
origins are not granted at installation.

## Data sent to a provider

For a translation request, the selected provider can receive:

- Page text selected for translation.
- Source and target language instructions.
- Matching terminology constraints and structural token placeholders.
- Provider-specific prompt or model parameters.
- Provider credentials in request headers when that provider requires them.

OpenAI-compatible requests also include the current page URL and domain as
translation context. Azure and Google requests do not add that context field.
LingoFlow does not add the page title, cookies, or form values as provider
request fields. Text collected from a page can itself contain personal or
sensitive information, so users should avoid translating content they do not
want the selected provider to process.

Google Translate Free sends the source text as a request URL query parameter.
That URL may be visible to Google and to network infrastructure that handles
the HTTPS request. This provider is experimental and should not be used for
sensitive text.

Connection testing sends a short LingoFlow sample sentence and the configured
authentication material to the selected endpoint; it does not send page text.

## Local endpoints and transport security

HTTPS encrypts data in transit to a remote provider. A custom `http://`
endpoint does not encrypt page text or credentials. Use HTTP only for a trusted
local endpoint such as loopback. Use HTTPS for remote providers.

## Retention and deletion

- Settings, credentials, rules, and terminology remain until the user edits or
  deletes them, resets extension storage, or uninstalls the extension.
- Cache entries remain until cleared, pruned by the configured cache limit, or
  removed with the extension.
- Page diagnostics and active session state are discarded with the page or
  browser session and are not uploaded by LingoFlow.
- Exported rule or terminology files are saved wherever the user chooses and
  are then outside extension storage.

Users can clear the current-site or entire translation cache, remove provider
credentials, and delete rules or terminology from Settings. Uninstalling the
extension removes its browser-managed local storage according to browser
behavior.

## Third-party providers

The selected provider's terms and privacy policy apply to content and
credentials sent to that provider. LingoFlow does not control a provider's
logging, retention, training, regional processing, or disclosure practices.
Users are responsible for choosing a provider appropriate for their content.

## Data not used by LingoFlow

LingoFlow does not:

- Sell, rent, or broker user data.
- Use data for advertising, creditworthiness, lending, or unrelated purposes.
- Collect analytics or telemetry.
- Track browsing activity across users or devices.
- Execute code downloaded from a remote server.

## Changes

Material changes to data handling will be reflected here, in the extension UI
when a new disclosure or consent is required, and in the changelog.

## Contact

Privacy questions can be opened in the repository's public issue tracker only
when they contain no sensitive data. Security vulnerabilities or reports that
contain private information must use the private reporting channel identified
in [SECURITY.md](SECURITY.md).
