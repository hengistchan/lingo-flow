# Release Procedure

This procedure prepares and publishes a release candidate in explicit stages.
For `0.1.0-rc.1`, the final engineering and packaged-browser gates have passed,
and the candidate is published as the
[v0.1.0-rc.1 GitHub prerelease](https://github.com/hengistchan/lingo-flow/releases/tag/v0.1.0-rc.1).
Browser-store submissions have not started.

## 1. Confirm release metadata

For `0.1.0-rc.1`, both package files must contain the same display version:

- `package.json`
- `apps/extension/package.json`

The generated Chrome and Edge manifests use:

```json
{
  "version": "0.1.0.1",
  "version_name": "0.1.0-rc.1"
}
```

Manifest update versions are reserved as follows:

- `X.Y.Z-rc.N` → `X.Y.Z.N`, for RC numbers 1–99.
- Stable `X.Y.Z` → `X.Y.Z.100`.

Do not publish two packages with the same numeric manifest version. Browser
stores use the numeric field, not `version_name`, to order updates.

## 2. Start from a reviewable tree

- Confirm the intended commit and branch.
- Confirm `git status --short` has no unknown build inputs.
- Install the locked dependency graph:

```bash
pnpm install --frozen-lockfile
```

- Review `CHANGELOG.md`, `RELEASE_NOTES.md`, `docs/PRIVACY.md`, and
  `docs/STORE_LISTING.md` against current behavior.

## 3. Run the quality gates

```bash
pnpm typecheck
pnpm test
pnpm test:e2e
git diff --check
```

Optional live-provider acceptance requires operator-owned credentials and must
not print or store them in logs.

### Recorded final gate results for 0.1.0-rc.1

- Unit tests: 498/498 passed.
- Type checking: passed.
- Final Chrome and Edge ZIP packaging and release verification: passed.
- Bundled Chromium E2E: 48 passed, 1 optional public-page acceptance test
  skipped.
- Google Chrome `150.0.7871.187` E2E: 48 passed, 1 optional public-page
  acceptance test skipped.
- Microsoft Edge `150.0.4078.105` E2E: 48 passed, 1 optional public-page
  acceptance test skipped.

The skipped case is gated by `LINGOFLOW_PUBLIC_E2E=1`; it was not run and is
not counted as passed.

## 4. Build and package both browsers

```bash
pnpm package
```

This command:

1. Removes previous WXT output.
2. Builds Chrome MV3.
3. Creates a deterministic Chrome ZIP.
4. Builds Edge MV3.
5. Creates a deterministic Edge ZIP.
6. Verifies versions, manifests, permissions, contents, common credential
   formats, and byte-for-byte archive reproduction.
7. Writes `apps/extension/output/SHA256SUMS`.

Expected files:

```text
apps/extension/output/lingoflow-0.1.0-rc.1-chrome-mv3.zip
apps/extension/output/lingoflow-0.1.0-rc.1-edge-mv3.zip
apps/extension/output/SHA256SUMS
```

The custom packager stores sorted files with fixed ZIP metadata. It intentionally
does not rely on filesystem modification times.

## 5. Clean-profile acceptance

Extract each archive into a new directory. Do not load the source-tree output
for this acceptance pass.

### Chrome

1. Create a fresh Chrome profile with no other extensions.
2. Open `chrome://extensions`, enable Developer mode, and load the extracted
   Chrome archive.
3. Complete the required release smoke scope in `MANUAL_QA.md`; record extended
   provider and feature-matrix items separately without treating unavailable
   operator credentials as a clean-profile failure.

### Microsoft Edge

1. Create a fresh Edge profile with no other extensions.
2. Open `edge://extensions`, enable Developer mode, and load the extracted Edge
   archive.
3. Complete the same required smoke scope and record the Edge version and
   operating system.

Chrome success is not evidence for Edge. If Edge is unavailable on the release
machine, the Edge gate remains incomplete.

### Recorded 0.1.0-rc.1 evidence

The required default-provider smoke path passed on 2026-07-29 using packages
extracted from the two RC ZIPs:

- Google Chrome `150.0.7871.187`
- Microsoft Edge `150.0.4078.105`

Both packages installed and remained enabled. Default Google translation
completed; starting translation closed the popup; reopening showed completion
and the page-rule prompt; revealing initially hidden content increased
translation blocks from 2 to 4; and no browser-extension or background-worker
errors were observed.

Credential-backed provider and extended display/cache scenarios remain
separate checklist items and are not implied by this smoke result.

## 6. Store preparation

- Use the exact disclosure and permission text in `STORE_LISTING.md`.
- Ensure the privacy-policy URL is publicly accessible without authentication
  and reflects the commit being uploaded.
- GitHub private vulnerability reporting is enabled and verified.
- Capture real product screenshots after clean-profile acceptance.
- Verify all claims, screenshots, locale text, and provider limitations match
  the uploaded package.
- Decide before store submission whether non-loopback custom `http://`
  providers remain allowed. This documented limitation does not block the
  GitHub prerelease.
- Upload the Chrome artifact only to Chrome Web Store and the Edge artifact only
  to Microsoft Edge Add-ons.

Official references:

- [Chrome manifest version and version_name](https://developer.chrome.com/docs/extensions/reference/manifest)
- [Chrome listing image requirements](https://developer.chrome.com/docs/webstore/images)
- [Chrome user-data disclosure requirements](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
- [Microsoft Edge publishing flow](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension)
- [Microsoft Edge Add-ons policies](https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies)

## 7. Tag and publish the GitHub RC only after approval

This repository procedure does not tag or publish automatically. After all RC
gates pass and the exact commit is approved, the operator may create an
annotated or signed tag according to repository policy and a release using the
already verified artifacts. Re-run `pnpm package` from that exact commit and
compare `SHA256SUMS` before upload.

For `0.1.0-rc.1`, tag `v0.1.0-rc.1` resolves to candidate commit
`a66b44aece04ee284d0f38aea63eb72c2a9817d5`. The GitHub prerelease is
published with both verified browser ZIPs and `SHA256SUMS`. This publication is
independent of the still-unsubmitted Chrome Web Store and Microsoft Edge
Add-ons tracks.

## Rollback

Browser stores require update versions to increase. They do not provide a
source-control-style rollback to a lower version.

If an RC must be withdrawn:

1. Stop or pause its distribution in each store dashboard when available.
2. Fix the issue from the last known-good source.
3. Increment the SemVer RC number so the numeric manifest version also
   increases.
4. Re-run every release and clean-profile gate.
5. Publish the corrected package as a new version.

Archive the faulty artifact, checksum, store review result, and corrective
release notes for traceability; do not silently replace a ZIP under the same
version.
