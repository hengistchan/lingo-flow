# Chrome and Edge Store Readiness Checklist

Target: `0.1.0-rc.1`

Do not submit until every required item is complete for the exact packaged
commit. Text intended for dashboard fields is in
[STORE_LISTING.md](STORE_LISTING.md).

The candidate's engineering gates have passed and it is ready for an approved
tag and GitHub prerelease, neither of which has been created yet. Chrome Web
Store and Microsoft Edge Add-ons have not received a submission; the unchecked
items below are store-specific work.

## Automated release evidence

- [x] `pnpm install --frozen-lockfile`
- [x] `pnpm typecheck`
- [x] `pnpm test` — 498/498 passed
- [x] Browser E2E matrix:
  - Bundled Chromium — 48 passed, 1 optional public-page acceptance test skipped
  - Google Chrome `150.0.7871.187` — 48 passed, 1 optional public-page
    acceptance test skipped
  - Microsoft Edge `150.0.4078.105` — 48 passed, 1 optional public-page
    acceptance test skipped
- [x] Final Chrome and Edge ZIP packaging and release verification
- [x] `git diff --check`
- [ ] `apps/extension/output/SHA256SUMS` archived with the candidate
- [ ] CI passes on the candidate commit

`pnpm package` must produce and verify:

- `lingoflow-0.1.0-rc.1-chrome-mv3.zip`
- `lingoflow-0.1.0-rc.1-edge-mv3.zip`
- Manifest display version `0.1.0-rc.1`
- Numeric manifest update version `0.1.0.1`
- No source maps, source/test files, environment files, or detected credentials
- Byte-identical archives when recreated from the same build output

## Identity and copy

- [x] Name: LingoFlow
- [x] Category: Productivity
- [x] Single-purpose description drafted
- [x] English detailed description drafted
- [x] Simplified Chinese detailed description drafted
- [x] Provider limitations and protected-page limitations disclosed
- [ ] Recheck all listing claims against the final candidate
- [ ] Confirm publisher display name and support contact in both dashboards

## Privacy and security

- [x] Privacy policy describes local website-content, URL metadata, credentials,
  terminology, rules, cache, retention, and deletion
- [x] Provider transmission is disclosed
- [x] Google query-parameter behavior is disclosed
- [x] Remote-code answer is documented as No
- [x] Required and optional permission justifications are drafted
- [ ] Push the current privacy policy to its public URL
- [ ] Verify the privacy URL without authentication
- [ ] Complete website-content, browsing-activity, authentication-information,
  and user-provided-data fields in both dashboards
- [ ] Confirm the dashboard answers match the exact current field names
- [x] GitHub private vulnerability reporting enabled and tested
- [ ] Decide whether non-loopback custom `http://` providers must be blocked
  before browser-store submission; current behavior permits plaintext transport
  after explicit origin approval. This known limitation does not block the
  GitHub prerelease.

Do not answer “handles no user data.” LingoFlow handles website content and
page URL metadata locally, sends requested text to the selected provider, and
sends current page URL/domain context to OpenAI-compatible providers.

## Permissions

Required:

- [x] `activeTab` — current page after the user invokes the extension
- [x] `scripting` — isolated content-runtime injection
- [x] `storage` — local settings, credentials, rules, terminology, and cache
- [x] No required `<all_urls>`

Provider hosts:

- [x] Azure Translator
- [x] OpenAI
- [x] Google Translate Free
- [x] Optional HTTP/HTTPS patterns are not granted at installation
- [x] Runtime asks for the exact custom-provider origin
- [ ] Reconfirm store reviewers accept the optional-host design

## Icons and store media

Packaged:

- [x] 16×16 PNG
- [x] 32×32 PNG
- [x] 48×48 PNG
- [x] 128×128 PNG

Store dashboard assets:

- [ ] Chrome: 440×280 small promotional image
- [ ] Chrome: 1–5 screenshots at 1280×800 or 640×400
- [ ] Edge: square logo, 300×300 recommended and 128×128 minimum
- [ ] Edge: 440×280 small promotional tile
- [ ] Edge: optional screenshots, up to six, at 1280×800 or 640×480
- [ ] Optional 1400×560 marquee/large tile
- [ ] All screenshots captured from the packaged RC in a clean profile
- [ ] No credentials, private URLs, or unrelated brands visible in media

## Clean-profile acceptance

Chrome:

- [x] Version recorded: Google Chrome `150.0.7871.187`
- [x] New clean profile used
- [x] Candidate extracted and loaded from the Chrome ZIP
- [x] No install or service-worker errors in the recorded smoke pass
- [x] Required default-provider smoke scope recorded in
  [MANUAL_QA.md](MANUAL_QA.md)

Microsoft Edge:

- [x] Version recorded: Microsoft Edge `150.0.4078.105`
- [x] New clean profile used
- [x] Candidate extracted and loaded from the Edge ZIP
- [x] No install or service-worker errors in the recorded smoke pass
- [x] Required default-provider smoke scope recorded in
  [MANUAL_QA.md](MANUAL_QA.md)

Chrome acceptance does not satisfy the Edge gate.

## Provider acceptance

- [x] Google Translate Free basic flow works in clean Chrome and Edge profiles
- [ ] Azure succeeds with operator-owned credentials
- [ ] Azure rejects invalid credentials without leaking them
- [ ] OpenAI-compatible HTTPS endpoint succeeds
- [ ] Local Ollama or LM Studio loopback endpoint succeeds after exact origin
  permission
- [ ] Denied custom-origin permission produces a clear error
- [ ] Connection test sends only the documented sample
- [ ] Diagnostics and logs contain no credentials

## Product acceptance

- [x] Popup starts translation and closes
- [x] Reopened popup shows terminal completion status
- [ ] Reopened popup shows accurate live/in-progress status in both clean profiles
- [ ] Long translation can be stopped without late rendering or new requests
- [ ] Successful results remain after a partial/cancelled session
- [ ] Retry-failed affects only failed items
- [ ] Changing language cannot render a stale previous-language result
- [x] Previously hidden content translates when revealed (2 → 4 blocks)
- [ ] Pointer sentence translation has a complete loading/success/error lifecycle
- [ ] Page-rule capture starts from the completed popup prompt
- [x] Completed popup displays the page-rule prompt
- [ ] Rule add, edit, copy, import/export, compatibility check, and confirmed
  deletion work
- [ ] Provider and rule removal require a second confirmation
- [ ] Cache clear restores the expected next-request behavior
- [ ] Original DOM is restored without generated nodes after Clear
- [ ] Dark and reduced-motion modes are usable

## Submission and rollback

- [ ] Upload Chrome ZIP only to Chrome Web Store
- [ ] Upload Edge ZIP only to Microsoft Edge Add-ons
- [ ] Add certification notes from `STORE_LISTING.md`
- [ ] Save submitted listing text, asset hashes, artifact hashes, and review IDs
- [ ] Keep the previous known-good artifact and evidence
- [ ] Do not announce browser-store availability until each store has accepted
  and published its corresponding submission

If the candidate must be replaced, increment the RC number and submit a new,
higher numeric manifest version. Never silently replace an archive under an
existing version. See [RELEASE.md](RELEASE.md).
