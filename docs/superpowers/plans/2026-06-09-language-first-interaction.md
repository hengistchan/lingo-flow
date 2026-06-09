# Language-First Interaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild LingoFlow around a language-first reading flow: auto-detect source language, make the current page's target language easy to change, expose honest runtime states, and move technical settings behind functional navigation.

**Architecture:** Add shared language and localization helpers, then extend the settings and message contracts so popup UI consumes key-free provider readiness and page progress instead of guessing. Keep current-page language overrides inside the content runtime, while saved defaults remain background-owned. Rebuild popup and options only after those contracts are tested.

**Tech Stack:** WXT, Vue 3, TypeScript, Chrome Manifest V3, Vitest, Playwright

**Design spec:** `docs/11-language-first-interaction-design.md`

---

## File Structure

### Create

- `packages/shared/src/languages.ts`  
  Owns supported language codes, human-readable labels, locale resolution, and safe fallback helpers.
- `packages/shared/src/languages.test.ts`  
  Locks language-label and fallback behavior.
- `packages/shared/src/i18n.ts`  
  Owns the initial Simplified Chinese and English interface-copy catalog.
- `packages/shared/src/i18n.test.ts`  
  Locks browser-locale resolution, copy lookup, and English fallback.
- `packages/settings/src/summary.test.ts`  
  Locks key-free settings summary and provider readiness.
- `packages/providers/src/connection.test.ts`  
  Locks explicit provider connection checks with mocked network responses.
- `packages/runtime/src/runtime.test.ts`  
  Locks per-page language overrides and honest progress states.

### Modify

- `packages/shared/src/index.ts`  
  Re-exports language helpers.
- `packages/types/src/index.ts`  
  Adds UI locale, settings summary, message payload, and honest progress types.
- `packages/settings/src/index.ts`  
  Adds settings schema migration, source auto-detect default, and safe UI summary.
- `packages/settings/src/settings.test.ts`  
  Tests defaults and legacy migration.
- `apps/extension/entrypoints/background.ts`  
  Serves key-free summary and explicit provider connection-test messages.
- `packages/runtime/src/index.ts`  
  Consumes current-run language overrides and derives honest terminal states.
- `apps/extension/entrypoints/popup/App.vue`  
  Becomes a language-first current-page command surface.
- `apps/extension/entrypoints/options/App.vue`  
  Gets functional navigation, language selectors, and progressive disclosure.
- `e2e/preview.spec.ts`  
  Covers readable language controls and options navigation.
- `e2e/extension.spec.ts`  
  Covers real settings summary, current-page override, and honest runtime states.
- `docs/09-acceptance-checklist.md`  
  Records the new interaction acceptance requirements.

## Guardrails

- Keep production permissions at `activeTab`, `scripting`, and `storage`.
- Do not add `<all_urls>`.
- Popup must never receive provider API keys.
- Selecting a popup target language must not persist the global default.
- Do not claim a detected language until real detection evidence exists.
- Do not show `done` when every block failed.
- Commit after every task.

---

### Task 1: Shared Language Catalog and Localized Interface Copy

**Files:**
- Create: `packages/shared/src/languages.ts`
- Create: `packages/shared/src/languages.test.ts`
- Create: `packages/shared/src/i18n.ts`
- Create: `packages/shared/src/i18n.test.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/types/src/index.ts`

- [x] **Step 1: Write failing language catalog tests**

Add tests for:

```ts
expect(getLanguageLabel('zh-Hans', 'zh-Hans')).toBe('简体中文')
expect(getLanguageLabel('ja', 'en')).toBe('Japanese')
expect(resolveSupportedLanguage('unsupported', 'zh-Hans')).toBe('zh-Hans')
expect(getTargetLanguageOptions().some(option => option.code === 'auto')).toBe(false)
expect(getSourceLanguageOptions()[0].code).toBe('auto')
expect(resolveUiLocale('zh-TW')).toBe('zh-Hans')
expect(t('zh-Hans', 'popup.translateTo', { language: '日语' })).toBe('翻译为日语')
expect(t('unsupported', 'popup.translateTo', { language: 'Japanese' })).toBe('Translate to Japanese')
```

- [x] **Step 2: Run tests and verify red**

Run:

```bash
pnpm vitest run packages/shared/src/languages.test.ts packages/shared/src/i18n.test.ts
```

Expected: FAIL because the language helpers do not exist.

- [x] **Step 3: Implement the language catalog**

Define:

```ts
export type UiLocale = 'zh-Hans' | 'en'

export type LanguageOption = {
  code: string
  englishName: string
  nativeName: string
  supportsSource: boolean
  supportsTarget: boolean
}
```

Include the initial catalog from the design spec. Implement:

```ts
export function getLanguageLabel(code: string, locale: UiLocale): string
export function getSourceLanguageOptions(): LanguageOption[]
export function getTargetLanguageOptions(): LanguageOption[]
export function resolveSupportedLanguage(code: string, fallback: string): string
export function resolveUiLocale(browserLanguage?: string): UiLocale
```

- [x] **Step 4: Implement localized interface copy**

Define a typed initial copy catalog for popup and options:

```ts
export type UiCopyKey =
  | 'popup.autoDetect'
  | 'popup.translateTo'
  | 'popup.translateAgain'
  | 'popup.translatingTo'
  | 'popup.providerNotConfigured'
  | 'popup.configureProvider'
  | 'popup.clearTranslation'
  | 'popup.settings'
  | 'options.languages'
  | 'options.providers'
  | 'options.storage'
  | 'options.advanced'
  | 'options.save'
  | 'options.testConnection'

export function t(
  locale: UiLocale | string,
  key: UiCopyKey,
  variables?: Record<string, string | number>,
): string
```

The initial catalog supports Simplified Chinese and English. Unknown UI locales
fall back to English. Components must consume this helper instead of duplicating
visible bilingual strings.

- [x] **Step 5: Run focused and full unit tests**

Run:

```bash
pnpm vitest run packages/shared/src/languages.test.ts packages/shared/src/i18n.test.ts
pnpm test
pnpm typecheck
```

Expected: all pass.

- [x] **Step 6: Commit**

```bash
git add packages/shared/src/languages.ts packages/shared/src/languages.test.ts packages/shared/src/i18n.ts packages/shared/src/i18n.test.ts packages/shared/src/index.ts packages/types/src/index.ts
git commit -m "feat: add language and interface catalogs"
```

---

### Task 2: Settings Defaults, Migration, and Key-Free Summary

**Files:**
- Modify: `packages/types/src/index.ts`
- Modify: `packages/settings/src/index.ts`
- Modify: `packages/settings/src/settings.test.ts`
- Create: `packages/settings/src/summary.test.ts`
- Modify: `apps/extension/entrypoints/background.ts`

- [x] **Step 1: Write failing settings tests**

Test:

```ts
expect(DEFAULT_SETTINGS.sourceLang).toBe('auto')
expect(migrateSettings({ sourceLang: 'en' }).sourceLang).toBe('auto')
expect(getSettingsSummary(configuredSettings)).toMatchObject({
  targetLang: 'zh-Hans',
  providerId: 'azure-translator',
  providerConfigured: true,
})
expect(JSON.stringify(getSettingsSummary(configuredSettings))).not.toContain('secret-key')
```

Also test incomplete Azure and OpenAI configurations return
`providerConfigured: false`.

- [x] **Step 2: Run tests and verify red**

Run:

```bash
pnpm vitest run packages/settings/src/settings.test.ts packages/settings/src/summary.test.ts
```

Expected: FAIL because migration and summary helpers do not exist.

- [x] **Step 3: Implement schema version and migration**

Add:

```ts
const CURRENT_SETTINGS_VERSION = 1

type AppSettings = {
  version: number
  interfaceLocale: 'auto' | UiLocale
  // existing fields
}
```

Migration rules:

- Unversioned settings with `sourceLang: 'en'` migrate to `auto`.
- Existing target language and provider configuration remain unchanged.
- Unsupported language codes fall back through shared language helpers.

- [x] **Step 4: Implement key-free settings summary**

Add:

```ts
type SettingsSummary = {
  sourceLang: 'auto' | string
  targetLang: string
  interfaceLocale: 'auto' | UiLocale
  providerId: ProviderId
  providerName: string
  providerConfigured: boolean
}
```

Add background message:

```ts
case 'settings/getSummary':
  return getSettingsSummary(await getSettings())
```

Do not include provider configuration objects in this response.

- [x] **Step 5: Verify**

Run:

```bash
pnpm vitest run packages/settings/src/settings.test.ts packages/settings/src/summary.test.ts
pnpm test
pnpm typecheck
```

Expected: all pass.

- [x] **Step 6: Commit**

```bash
git add packages/types/src/index.ts packages/settings/src/index.ts packages/settings/src/settings.test.ts packages/settings/src/summary.test.ts apps/extension/entrypoints/background.ts
git commit -m "feat: add safe settings summary and migration"
```

---

### Task 3: Current-Page Language Overrides and Honest Progress

**Files:**
- Modify: `packages/types/src/index.ts`
- Modify: `packages/runtime/src/index.ts`
- Create: `packages/runtime/src/runtime.test.ts`

- [x] **Step 1: Write failing runtime tests**

Use a fake document and fake runtime messages to prove:

```ts
await runtime.translatePage({ targetLang: 'ja' })
expect(sentTranslationTask.targetLang).toBe('ja')
expect(savedDefaultTargetLanguage).toBe('zh-Hans')
```

Test terminal state derivation:

```ts
expect(deriveProgressStatus({ translated: 3, failed: 0, total: 3 })).toBe('done')
expect(deriveProgressStatus({ translated: 2, failed: 1, total: 3 })).toBe('partial')
expect(deriveProgressStatus({ translated: 0, failed: 3, total: 3 })).toBe('failed')
```

- [x] **Step 2: Run tests and verify red**

Run:

```bash
pnpm vitest run packages/runtime/src/runtime.test.ts
```

Expected: FAIL because override payload and honest states are not implemented.

- [x] **Step 3: Extend typed page messages**

Change:

```ts
type PageTranslateMessage = {
  type: 'page/translate'
  payload?: {
    sourceLang?: 'auto' | string
    targetLang?: string
  }
}
```

Extend progress with `sourceLang`, `targetLang`, `partial`, and `messageCode`.

- [x] **Step 4: Implement current-run overrides**

The content runtime must:

- read persisted runtime settings;
- merge optional message payload only for this run;
- build cache keys and tasks from the effective languages;
- keep persisted settings unchanged;
- retain effective source and target language in page progress.

- [x] **Step 5: Implement honest terminal states**

Rules:

```ts
if (totalBlocks === 0) -> failed + messageCode: 'no_readable_text'
if (translatedBlocks === totalBlocks) -> done
if (translatedBlocks > 0 && failedBlocks > 0) -> partial
if (translatedBlocks === 0 && failedBlocks > 0) -> failed
```

- [x] **Step 6: Verify**

Run:

```bash
pnpm vitest run packages/runtime/src/runtime.test.ts
pnpm test
pnpm typecheck
```

Expected: all pass.

- [x] **Step 7: Commit**

```bash
git add packages/types/src/index.ts packages/runtime/src/index.ts packages/runtime/src/runtime.test.ts
git commit -m "feat: add page language overrides and honest progress"
```

---

### Task 4: Language-First Popup

**Files:**
- Modify: `apps/extension/entrypoints/popup/App.vue`
- Modify: `e2e/preview.spec.ts`

- [x] **Step 1: Update preview E2E expectations first**

Add assertions that the popup:

- shows `Auto-detect page language`;
- shows a target-language combobox with `Simplified Chinese`;
- does not show `English detected`, `Configured provider`, or `Render mode`;
- changes the primary action to `Translate to Japanese` after selecting
  Japanese;
- hides `Clear translation` while idle.

- [x] **Step 2: Run preview E2E and verify red**

Run:

```bash
pnpm build
pnpm exec playwright test e2e/preview.spec.ts
```

Expected: FAIL against the current popup.

- [x] **Step 3: Rebuild popup state loading**

On mount:

- request `settings/getSummary` when extension APIs exist;
- request page status;
- initialize pending target from existing page status, then saved default;
- fall back to safe preview values when extension APIs are absent.

- [x] **Step 4: Rebuild popup hierarchy**

Implement:

- settings icon button with accessible name and tooltip;
- source summary: `Auto-detect page language`;
- target-language selector;
- action-oriented primary button;
- conditional clear action;
- provider-not-configured state;
- `aria-live` status summary;
- localized visible labels using shared helpers.

Remove idle Provider and Render mode rows.

- [x] **Step 5: Send target override**

Translate with:

```ts
sendTabMessage(tab.id, {
  type: 'page/translate',
  payload: { targetLang: pendingTargetLang.value },
})
```

- [x] **Step 6: Verify preview behavior**

Run:

```bash
pnpm build
pnpm exec playwright test e2e/preview.spec.ts
pnpm typecheck
```

Expected: all pass.

- [x] **Step 7: Commit**

```bash
git add apps/extension/entrypoints/popup/App.vue e2e/preview.spec.ts
git commit -m "feat: make popup language first"
```

---

### Task 5: Functional Options Navigation and Language Selectors

**Files:**
- Modify: `apps/extension/entrypoints/options/App.vue`
- Modify: `e2e/preview.spec.ts`
- Modify: `e2e/extension.spec.ts`

- [x] **Step 1: Write failing options E2E expectations**

Test that:

- source and target language controls are comboboxes;
- target shows a human-readable language name;
- source defaults to Auto-detect;
- clicking Providers changes selected navigation state and visible section;
- technical Advanced fields are not visible in the Languages section;
- Save Settings becomes enabled only after a change.

- [x] **Step 2: Run E2E and verify red**

Run:

```bash
pnpm build
pnpm exec playwright test e2e/preview.spec.ts e2e/extension.spec.ts
```

Expected: FAIL against the current options page.

- [x] **Step 3: Implement real section navigation**

Use a local section state:

```ts
type SettingsSection = 'languages' | 'providers' | 'storage' | 'advanced'
```

Render only the selected section. Mark selected navigation with
`aria-current="page"`.

- [x] **Step 4: Replace language code inputs**

Use native `<select>` controls populated from the shared language catalog.
Visible options use human-readable names; values remain provider language
codes.

- [x] **Step 5: Add progressive disclosure**

- Languages: default source, target, interface language.
- Providers: readiness and provider setup.
- Storage: cache toggle and clear-all action.
- Advanced: endpoint, model, render mode, maximum cache entries.
- Remove typed-domain cache clearing.

- [x] **Step 6: Add dirty save behavior**

- Keep an immutable loaded snapshot.
- Enable save only when current settings differ.
- Reset dirty state after a successful save.
- Show save result near the save action.

- [x] **Step 7: Verify**

Run:

```bash
pnpm build
pnpm exec playwright test e2e/preview.spec.ts e2e/extension.spec.ts
pnpm typecheck
```

Expected: all pass.

- [x] **Step 8: Commit**

```bash
git add apps/extension/entrypoints/options/App.vue e2e/preview.spec.ts e2e/extension.spec.ts
git commit -m "feat: reorganize language and provider settings"
```

---

### Task 6: Explicit Provider Connection Test

**Files:**
- Modify: `packages/types/src/index.ts`
- Modify: `packages/providers/src/index.ts`
- Create: `packages/providers/src/connection.test.ts`
- Modify: `apps/extension/entrypoints/background.ts`
- Modify: `apps/extension/entrypoints/options/App.vue`
- Modify: `e2e/extension.spec.ts`

- [x] **Step 1: Write failing provider connection tests**

Mock `fetch` and verify:

- Azure connection test sends one minimal translation request and succeeds on a
  valid response;
- OpenAI-compatible connection test sends one minimal translation request and
  succeeds on a valid response;
- authentication and network failures return normalized actionable errors;
- no connection test runs automatically when ordinary settings are saved.

- [x] **Step 2: Run tests and verify red**

Run:

```bash
pnpm vitest run packages/providers/src/connection.test.ts
```

Expected: FAIL because explicit connection tests do not exist.

- [x] **Step 3: Add an explicit background message**

Add:

```ts
type TestProviderConnectionMessage = {
  type: 'provider/testConnection'
  payload: {
    providerId: ProviderId
    config: AzureTranslatorConfig | OpenAICompatibleConfig
  }
}
```

The request is initiated only by a deliberate options-page action. Never log or
return the supplied key.

- [x] **Step 4: Implement provider probes**

Use each provider's normal public translation API with one short deterministic
source string. Validate the response shape and return a key-free result:

```ts
type ProviderConnectionResult = {
  ok: boolean
  providerId: ProviderId
  messageCode: 'connection_ok' | 'config_incomplete' | 'authentication_failed' | 'network_failed' | 'provider_failed'
}
```

- [x] **Step 5: Add options interaction**

- Keep ordinary `Save settings` separate.
- Add `Test connection` inside the selected provider section.
- Explain that testing sends a short sample to the provider.
- Show pending, success, and actionable failure state near the action.

- [x] **Step 6: Verify**

Run:

```bash
pnpm vitest run packages/providers/src/connection.test.ts
pnpm build
pnpm exec playwright test e2e/extension.spec.ts
pnpm typecheck
```

Expected: all pass with mocked provider responses.

- [x] **Step 7: Commit**

```bash
git add packages/types/src/index.ts packages/providers/src/index.ts packages/providers/src/connection.test.ts apps/extension/entrypoints/background.ts apps/extension/entrypoints/options/App.vue e2e/extension.spec.ts
git commit -m "feat: add explicit provider connection test"
```

---

### Task 7: Installed Extension Language and State Coverage

**Files:**
- Modify: `e2e/extension.spec.ts`
- Modify: `docs/09-acceptance-checklist.md`

- [x] **Step 1: Add installed-extension E2E coverage**

Cover:

- popup reads key-free settings summary from the real background worker;
- provider-not-configured state is shown instead of Ready;
- current-page target override reaches translation tasks;
- saved default target remains unchanged after a popup override;
- all failed blocks produce `failed`;
- mixed results produce `partial`;
- production manifest remains low permission.

Use test-only provider routing or deterministic runtime stubs. Do not call real
provider APIs or store real keys.

- [x] **Step 2: Run installed E2E and verify red where behavior is missing**

Run:

```bash
pnpm build
pnpm exec playwright test e2e/extension.spec.ts
```

Expected: new tests identify any remaining contract gaps.

- [x] **Step 3: Make only the minimal implementation corrections**

Update production files only when an installed-extension test exposes a real
gap. Keep fixes within the language-first spec and commit boundary.

- [x] **Step 4: Update acceptance checklist**

Add explicit checklist items for:

- readable language selectors;
- current-page override;
- provider readiness;
- honest partial/failed states;
- functional options navigation.

- [x] **Step 5: Run complete verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm test:e2e
node --input-type=module - <<'NODE'
import { readFileSync } from 'node:fs'
const manifest = JSON.parse(readFileSync('apps/extension/output/chrome-mv3/manifest.json', 'utf8'))
console.log({
  permissions: manifest.permissions,
  hostPermissions: manifest.host_permissions,
  contentScripts: manifest.content_scripts ?? [],
})
NODE
```

Expected:

- all tests pass;
- build passes through `pnpm test:e2e`;
- no `<all_urls>`;
- production permissions remain low.

- [x] **Step 6: Commit**

```bash
git add e2e/extension.spec.ts docs/09-acceptance-checklist.md
git add <any minimal production files changed by installed E2E findings>
git commit -m "test: cover language-first extension flows"
```

---

### Task 8: Visual and Interaction QA

**Files:**
- Modify only files required by concrete QA findings.

- [x] **Step 1: Build and start the current production preview**

Run:

```bash
pnpm build
python3 -m http.server 4179 --directory apps/extension/output/chrome-mv3
```

- [x] **Step 2: Verify popup states**

Capture and inspect:

- provider-not-configured;
- idle with target selector;
- translating;
- complete;
- partial;
- failed.

Check that essential popup text is at least 12px, controls do not overlap, and
the primary action clearly names the target language.

- [x] **Step 3: Verify options states**

Check desktop and narrow viewport:

- real navigation selected state;
- readable language selectors;
- provider setup flow;
- storage controls;
- advanced disclosure;
- dirty/save state.

- [x] **Step 4: Fix concrete QA findings**

Use the smallest scoped changes. Do not add unrelated redesign elements.

- [x] **Step 5: Run final verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm test:e2e
git diff --check
git status --short
```

Expected: all pass and only intended QA changes remain.

- [x] **Step 6: Commit**

```bash
git add <qa files>
git commit -m "fix: polish language-first interaction"
```
