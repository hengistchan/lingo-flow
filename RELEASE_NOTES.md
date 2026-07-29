# LingoFlow 0.1.0-rc.1

Candidate status: **final gates passed; ready for an approved tag and GitHub
prerelease**. The tag and prerelease have not yet been created, and neither
Chrome Web Store nor Microsoft Edge Add-ons has received a submission.

LingoFlow adds an inline bilingual reading layer to Chrome and Microsoft Edge.
It keeps settings and reading data in the extension profile, has no
LingoFlow-operated backend, and lets the user choose the translation provider.

## Highlights

- Translate article and documentation text next to the original page content.
- Reopen the toolbar popup to inspect live translation status, stop a long
  translation, or retry only failed blocks.
- Keep already completed translations after stopping while queued requests,
  loading placeholders, and late results from that session are discarded.
- Isolate translation sessions by tab and source revision so cancelled or
  previous-language results cannot overwrite the current page.
- Translate readable content that appears later in tabs, accordions, SPAs, and
  infinite-scroll views without duplicating existing translations.
- Capture and maintain per-site content rules, then test them with read-only
  diagnostics.
- Apply scoped terminology consistently across page and pointer-sentence
  translation.
- Choose Azure Translator, an OpenAI-compatible endpoint, a local compatible
  endpoint, or experimental Google Translate Free.
- Package the same source as separately named Chrome and Edge MV3 archives.

## Privacy and network behavior

Translation is not an offline operation unless the selected provider is local.
When the user starts a translation, LingoFlow sends the selected page text,
source and target language instructions, and any matching terminology
constraints to that provider. Provider credentials are included only when the
selected endpoint requires them. OpenAI-compatible requests also include the
current page URL and domain as translation context. Azure and Google requests
do not add that context field, and LingoFlow does not add the page title,
cookies, or form values to provider requests.

Google Translate Free is experimental and sends each text in the request URL
query to `translate.googleapis.com`. Users who need contractual privacy,
reliability, or terminology controls should select a dedicated provider.

See [the privacy policy](docs/PRIVACY.md) for storage, retention, deletion, and
third-party details.

## Release artifacts

Run:

```bash
pnpm install --frozen-lockfile
pnpm package
```

Expected artifacts:

- `apps/extension/output/lingoflow-0.1.0-rc.1-chrome-mv3.zip`
- `apps/extension/output/lingoflow-0.1.0-rc.1-edge-mv3.zip`
- `apps/extension/output/SHA256SUMS`

The manifest displays `0.1.0-rc.1` and uses numeric update version `0.1.0.1`.
The packaging gate recreates each archive and verifies that it is
byte-for-byte reproducible.

## Final release-gate evidence

The final candidate passed:

- 498/498 unit tests.
- Type checking.
- Final Chrome and Edge ZIP packaging and release verification.
- Bundled Chromium: 48 passed, 1 optional public-page acceptance test skipped.
- Google Chrome `150.0.7871.187`: 48 passed, 1 optional public-page acceptance
  test skipped.
- Microsoft Edge `150.0.4078.105`: 48 passed, 1 optional public-page acceptance
  test skipped.

The skipped case requires `LINGOFLOW_PUBLIC_E2E=1`; it was not run and is not
reported as passed. GitHub private vulnerability reporting is enabled and
available for sensitive reports.

## Clean-profile acceptance

On 2026-07-29, both archives were extracted and loaded in new browser profiles:

- Google Chrome `150.0.7871.187`
- Microsoft Edge `150.0.4078.105`

In both browsers, the extension installed and remained enabled, the default
Google provider completed a page translation, starting translation closed the
popup, and reopening it showed completion plus the “Add a rule for this page”
entry. Revealing initially hidden content increased rendered translation blocks
from 2 to 4. No browser-extension or background-service-worker errors were
observed during this smoke pass.

This evidence covers the default-provider release smoke path. It does not claim
live Azure, OpenAI-compatible, custom-provider, or every extended manual QA
matrix item was exercised in both browsers.

## Known limitations

- Google Translate Free uses an undocumented endpoint and may be throttled,
  changed, or unavailable without notice.
- Browser-internal pages, extension stores, and other protected pages cannot be
  translated.
- Shadow DOM support is limited to open roots; cross-origin iframe content is
  not translated.
- A custom `http://` endpoint does not encrypt page text or credentials. Use
  HTTP only for a trusted local endpoint such as loopback; use HTTPS for remote
  services. Allowing a non-loopback HTTP custom endpoint is a documented RC
  limitation; it does not block the GitHub prerelease, but remains a policy and
  product decision before browser-store submission.
- Automatic site-rule distribution, cloud sync, user accounts, analytics, and
  Firefox packaging are not part of this RC.

## Publication status

No engineering gate remains before the approved GitHub RC publication action.
The next step is to create the tag and GitHub prerelease from the approved
commit and attach the already verified artifacts. That action has not yet been
performed.

Browser-store distribution is a separate track and has not been submitted. It
still requires:

- Publish an accessible privacy-policy URL and complete the website-content,
  browsing-activity, and authentication-information disclosures in both store
  dashboards.
- Capture final store screenshots and promotional artwork.
- Confirm publisher/support details and optional-host permission wording in
  both store dashboards.
- Decide whether remote, non-loopback `http://` custom providers remain allowed
  in store-distributed builds.

See [docs/RELEASE.md](docs/RELEASE.md) for the operator procedure and rollback
rules.
