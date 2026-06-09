# 11. Language-First Interaction Design

## Status

Approved direction for the next LingoFlow interaction refactor.

This document replaces the current developer-oriented popup and options
interaction model. It does not change the low-permission or local-first product
principles.

## Problem

LingoFlow currently exposes implementation details before the user's reading
task:

- The popup shows a hard-coded `English detected` value.
- The popup does not show the target language.
- The UI is entirely English, even for users who need translation to read
  English.
- Source and target languages are free-text code inputs.
- Provider and render-mode information occupy the popup's primary surface.
- Provider configuration can be missing while the popup still says `Ready`.
- The options sidebar looks interactive but does not navigate.
- Technical controls such as endpoint URLs and maximum cache entries are mixed
  with ordinary preferences.

The product must instead answer one question immediately:

> What language should this page become readable in?

## Product Model

LingoFlow has three distinct language concepts. They must not be conflated.

### Interface Language

The language used by popup and options UI.

- Default: follow the browser UI language.
- Initial supported UI locales: Simplified Chinese and English.
- Fallback: English.
- This is not the source or target translation language.

### Source Language

The language of the webpage being translated.

- Default: automatic detection.
- An explicit source language is an advanced override.
- The UI must never claim a detected language unless the runtime has real
  detection evidence.
- Until real detection evidence exists, display `Auto-detect page language`,
  not `English detected`.

### Target Language

The language the user wants to read.

- This is the primary translation control.
- Fresh installs default to Simplified Chinese.
- The default target language is saved in settings.
- The popup may override the target language for the current page without
  silently changing the saved default.

## Core Interaction Principles

1. **Reading task first**  
   Popup prioritizes target language and translation action.

2. **Human-readable language names**  
   Users choose `简体中文`, not `zh-Hans`.

3. **Safe explicit execution**  
   Changing a target language does not automatically make a paid provider
   request. The user confirms with the translate button.

4. **Progressive disclosure**  
   Provider internals, endpoints, model names, and cache limits live outside
   the primary reading flow.

5. **Honest status**  
   `Ready`, `Done`, and detected-language claims must be backed by real runtime
   state.

6. **Current-page convenience**  
   Actions that naturally depend on the current tab, such as clearing the
   current site's cache, belong in the popup rather than requiring a typed
   domain.

## Language Catalog

Create one shared language catalog used by popup, options, runtime validation,
and tests.

Each entry contains:

```ts
type LanguageOption = {
  code: string
  englishName: string
  nativeName: string
  supportsSource: boolean
  supportsTarget: boolean
}
```

The initial catalog should include commonly used reading languages:

- Auto-detect, source only
- Simplified Chinese
- Traditional Chinese
- English
- Japanese
- Korean
- Spanish
- French
- German
- Portuguese
- Italian
- Russian
- Arabic

The UI displays localized names while the runtime and providers continue using
language codes.

## Popup Information Architecture

The popup is a current-page command surface, not a settings summary.

### Persistent Header

- LingoFlow brand
- Honest status text
- Settings icon button with tooltip

Do not use a separate full-width `Open Settings` text button.

### Primary Language Control

Display a compact translation direction:

```text
Auto-detect page language
            ↓
[ Simplified Chinese ▾ ]
```

Rules:

- Source language is summarized, not presented as an equally prominent
  control.
- Target language is directly selectable.
- The selected target initially uses:
  1. the language of an existing page translation state, if present;
  2. otherwise the saved default target language.
- Selecting another target language only changes the pending current-page
  action.
- A language switch after a completed translation changes the primary action to
  `Translate again in {language}`.

### Primary Action

The button label must describe the result:

- `Translate to Simplified Chinese`
- `Translate again in Japanese`
- `Translating to Simplified Chinese...`

Avoid the generic `Translate Page` when the target language is known.

### Secondary Actions

Show actions only when relevant:

- `Clear translation`: visible after translations exist.
- `Clear this site's cache`: available from a compact overflow/details area.
- `Settings`: icon button in the header.

Do not show `Clear translation` in an untouched idle state.

### Removed From Primary Popup Surface

- Configured provider name
- Render mode
- Cache hit count while idle
- Technical language codes

Provider and cache information may appear in translation details after the main
task state.

## Popup State Model

### Provider Not Configured

The popup must not say `Ready`.

```text
Translation service is not configured
[ Configure translation service ]
```

The primary translation action is disabled or replaced by the configuration
action.

### Idle

Show translation direction and the primary translate action.

### Translating

Show:

- target language;
- translated blocks / total blocks;
- progress bar;
- a disabled translating action.

Do not replace the language context with implementation metrics.

### Complete

Show:

- translated block count;
- target language;
- clear translation action;
- retranslate action when another target is selected.

### Partial

If some blocks succeed and some fail, the result is `partial`, not `done`.

Show:

- translated count;
- failed count;
- a concise explanation;
- retry failed or retranslate action when supported.

### Failed

If no blocks were translated, show a user-actionable failure:

- provider not configured -> open provider settings;
- authentication failure -> review provider credentials;
- unavailable page -> explain that the page cannot be translated;
- network/provider failure -> retry.

Do not expose raw exception text as the primary message.

### Empty Page

Show `No readable text found on this page`, not a generic success state.

## Options Information Architecture

The sidebar must either navigate or be removed. The recommended design uses
real section navigation.

### Languages

Primary ordinary-user preferences:

- Default target language: searchable/selectable language control.
- Source language: `Auto-detect` by default, with explicit override.
- Interface language: follow browser, Simplified Chinese, or English.

### Translation Service

- Provider readiness summary: configured / incomplete.
- Default provider.
- Optional fallback provider.
- Provider-specific configuration.
- `Save and test connection` action.

Only show configuration fields for the selected provider by default. Other
providers can be expanded when the user chooses to configure them.

### Storage

- Cache enabled toggle.
- Human-readable cache usage summary when available.
- Clear all translation cache.

Remove typed-domain cache clearing from options. The current site's cache action
belongs in the popup.

### Advanced

- Render mode while there is only one supported mode.
- Provider endpoint overrides.
- Model name.
- Maximum cache entries.

Advanced settings remain available but do not compete with language and
provider onboarding.

### Saving

- Track dirty state.
- Disable the save button when nothing changed.
- Confirm successful save near the action.
- Warn before navigating away with unsaved changes.
- Provider connection testing is explicit and does not happen on every ordinary
  preference save.

## Runtime and Protocol Changes

### Defaults and Migration

- Change fresh-install `sourceLang` default from `en` to `auto`.
- Keep fresh-install `targetLang` default as `zh-Hans`.
- Add a settings schema version.
- Migrate legacy unversioned `sourceLang: en` to `auto`, because the previous
  UI did not establish reliable explicit user intent.

### Current-Page Translation Override

Extend the page translation command:

```ts
type PageTranslateMessage = {
  type: 'page/translate'
  payload?: {
    sourceLang?: 'auto' | string
    targetLang?: string
  }
}
```

The content runtime uses the payload override for the current translation run.
It does not persist the override as the global default.

### UI-Safe Settings Summary

Add a UI-safe background message that never returns API keys:

```ts
type SettingsSummary = {
  sourceLang: 'auto' | string
  targetLang: string
  providerId: ProviderId
  providerName: string
  providerConfigured: boolean
}
```

Popup uses this summary to choose its initial language and readiness state.

### Page Progress

Extend page progress with:

```ts
type PageTranslationProgress = {
  status: 'idle' | 'translating' | 'done' | 'partial' | 'failed'
  sourceLang: 'auto' | string
  targetLang: string
  totalBlocks: number
  translatedBlocks: number
  cacheHits: number
  failedBlocks: number
  messageCode?: string
}
```

Status rules:

- `done`: at least one translatable block exists and all blocks succeed.
- `partial`: at least one block succeeds and at least one block fails.
- `failed`: no blocks succeed because of an error.
- Empty-page state uses a dedicated message code and must not imply
  translation success.

## Interaction Copy

Visible copy must be localized and action-oriented.

Examples in Simplified Chinese:

- 自动检测网页语言
- 翻译为简体中文
- 正在翻译为简体中文
- 已翻译 42 个段落
- 3 个段落未能翻译
- 尚未配置翻译服务
- 配置翻译服务
- 清除译文
- 清除此网站的缓存

Avoid:

- Raw codes such as `zh-Hans`
- `Configured provider`
- `Ready` when the provider is not ready
- `Done` when every block failed
- Raw provider exception messages as the main UI

## Accessibility and Control Behavior

- Language controls have visible labels and accessible names.
- Searchable language controls support keyboard selection.
- Status changes use an `aria-live` region.
- Icon-only settings and overflow actions include tooltips and accessible
  names.
- Focus order follows the primary task: target language, translate action,
  relevant secondary actions.
- Do not use text smaller than 12px for essential popup information.

## Testing Strategy

### Unit Tests

- Language code resolves to localized human-readable name.
- Unsupported saved language falls back safely.
- Provider readiness is computed without exposing keys.
- Progress derives `done`, `partial`, and `failed` honestly.
- Legacy settings migrate source language to `auto`.

### Preview E2E

- Popup shows target language and does not show fake detection.
- User can select a target language.
- Primary action label updates to the selected language.
- Options language controls are selectors, not free-text inputs.
- Options navigation changes the visible section and selected state.

### Installed Extension E2E

- Popup receives a key-free settings summary from the real background worker.
- Current-page target override reaches the content runtime.
- Current-page override does not change the saved default.
- Partial and failed runs render honest status.
- Provider-not-configured state links to provider settings.

## Delivery Order

1. Shared language catalog, localized labels, defaults, and settings migration.
2. Typed protocol changes and honest progress derivation.
3. Popup language-first interaction and current-page target override.
4. Real options navigation and progressive disclosure.
5. Provider readiness and connection-test interaction.
6. Full preview and installed-extension E2E coverage.

## Acceptance Criteria

- A Chinese-browser user can understand the popup without reading English.
- The popup always makes the target language clear before translation.
- A user can temporarily translate the current page into another language
  without editing global settings.
- Fresh installs auto-detect source language and target Simplified Chinese.
- No UI claims a detected language without evidence.
- No UI says `Ready` when the selected provider is incomplete.
- No UI says `Done` when every translation block failed.
- Language codes are not exposed in ordinary language controls.
- Options sidebar navigation is functional.
- Ordinary users can configure language and provider without encountering
  endpoint, model, or cache-limit controls unless they open advanced settings.
- Production permissions remain `activeTab`, `scripting`, and `storage` without
  `<all_urls>`.
