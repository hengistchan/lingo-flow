# Security

## Threat model

LingoFlow is a BYOK browser extension. Its primary security boundaries are:

1. Provider credentials must not reach page scripts or content scripts.
2. Provider output must not execute as HTML or JavaScript.
3. Page scripts must not gain access to extension storage or privileged APIs.
4. Permissions and network destinations must remain limited to translation
   functionality.
5. Release archives must not contain credentials, development files, remote
   executable code, or unexpected permissions.

## Provider credentials

- Provider credentials are stored in `chrome.storage.local`.
- The Options extension page can read credentials so the user can edit provider
  configuration; the background service worker reads them to make requests.
- Credentials are not sent to the toolbar popup, content scripts, diagnostics,
  or page scripts.
- A credential is sent only as authentication for the provider endpoint the
  user selected.
- OpenAI-compatible translation requests include the current page URL and
  domain as model context; Azure and Google requests do not include that
  context field.
- Settings summaries exposed outside the Options page deliberately omit
  credentials.

The extension cannot protect data from a compromised provider endpoint or a
compromised browser profile.

## Provider output

- Translation output is rendered with `textContent` or `innerText`, not
  `innerHTML`.
- Provider output therefore cannot directly create elements or execute scripts.
- Inline code, links, URLs, and terminology constraints use placeholders that
  are validated before restoration.
- Results that no longer belong to the current source revision are discarded.

## Permissions

Required permissions:

| Permission | Purpose |
|---|---|
| `activeTab` | Access the active page after the user invokes LingoFlow |
| `scripting` | Inject the isolated content runtime when needed |
| `storage` | Store settings, credentials, rules, terminology, and cache locally |

Default provider hosts:

- `https://api.cognitive.microsofttranslator.com/*`
- `https://api.openai.com/*`
- `https://translate.googleapis.com/*`

Optional `https://*/*` and `http://*/*` patterns allow the extension to request
the exact custom-provider origin chosen by the user. They are not granted at
installation. HTTP does not provide transport encryption and should be limited
to trusted local endpoints; remote providers should use HTTPS. Allowing a
non-loopback HTTP custom endpoint is a documented RC limitation. It does not
block the GitHub prerelease, but whether to block it remains a browser-store
policy and product decision.

## Content-script boundary

- Content scripts run in an isolated world and do not receive credentials.
- Page content cannot call extension APIs directly.
- The inspector bridge exposes read-only DOM and diagnostics data for
  troubleshooting. It does not expose provider credentials.
- Diagnostics can contain page structure and text-derived metadata and should
  be reviewed before sharing.

## Local cache

The IndexedDB cache can contain raw source text, translated text, page URL and
domain metadata, and provider/language metadata. Cache keys use content hashes,
but cache values are not encrypted separately from the browser profile. Users
sharing an OS/browser profile should treat that profile as trusted.

## Remote code and dependencies

LingoFlow does not download or execute remote JavaScript, WebAssembly, or
configuration as code. Provider responses are data. Release packaging bundles
the extension's executable code and rejects source maps, source files,
development fixtures, common credential formats, and Unicode noncharacters.

Dependencies are locked in `pnpm-lock.yaml`; CI installs them with
`--frozen-lockfile`.

## Release verification

Before a release:

```bash
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm package
```

`pnpm package` builds Chrome and Edge independently and verifies:

- Package, display, and numeric manifest versions.
- Required and optional permissions.
- Required entrypoints and icons.
- Absence of source, test, environment, and source-map files.
- Absence of several high-confidence credential formats.
- Archive contents and byte-for-byte reproducibility.

Automated scanning reduces risk but does not replace manual review.

## Reporting vulnerabilities

Do not include credentials, private page content, or unreleased exploit details
in a public issue.

GitHub private vulnerability reporting is enabled and verified. Sensitive
reports can be submitted through
<https://github.com/hengistchan/lingo-flow/security/advisories/new>.
Non-sensitive security hardening suggestions may be filed in the repository
issue tracker.
