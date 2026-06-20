# LingoFlow UI Redesign — 书页批注 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the LingoFlow extension UI (popup, options, in-page translation) with a warm literary minimalism design, extracting shared design tokens and reusable components.

**Architecture:** A global CSS custom properties file defines all design tokens (colors, typography, spacing). Shared Vue components (Button, FormField, NavItem, LanguagePair) are created in `apps/extension/src/ui/`. Both popup and options entry points import the tokens and use the shared components. The renderer's injected CSS is updated to match.

**Tech Stack:** Vue 3 Composition API, TypeScript, CSS Custom Properties, WXT

## Global Constraints

- No new npm dependencies
- No changes to component logic or data flow — CSS and template-only changes
- All colors referenced from design tokens (CSS custom properties)
- Dark mode via `prefers-color-scheme` media query (existing pattern)
- Shared components use `<style scoped>` with `var()` references to global tokens
- SVG icons inline in templates (no external icon files)

---

### Task 1: Design Tokens Foundation

**Files:**
- Create: `apps/extension/src/ui/tokens.css`
- Modify: `apps/extension/entrypoints/popup/main.ts`
- Modify: `apps/extension/entrypoints/options/main.ts`

**Purpose:** Define all design tokens as CSS custom properties in a single file, imported globally by both entry points.

- [ ] **Step 1: Create the tokens CSS file**

```css
/* apps/extension/src/ui/tokens.css */

:root {
  /* ── Colors: Light Mode ── */
  --lf-ink: #1a1a1a;
  --lf-paper: #faf8f5;
  --lf-margin: #f2efeb;
  --lf-accent: #c05a2e;
  --lf-accent-hover: #a84d27;
  --lf-whisper: #b8b2a6;
  --lf-rule: #e0dbd3;
  --lf-ghost: #6b6560;

  /* ── Typography ── */
  --lf-font-serif: Georgia, "Noto Serif", "Source Han Serif SC", "Songti SC", serif;
  --lf-font-sans: system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;

  /* ── Spacing ── */
  --lf-radius: 0px;
  --lf-btn-h-primary: 40px;
  --lf-btn-h-secondary: 36px;
  --lf-btn-h-small: 34px;
  --lf-input-h: 38px;
  --lf-gap-form: 16px;
  --lf-gap-section: 20px;
}

@media (prefers-color-scheme: dark) {
  :root {
    --lf-ink: #e8e4de;
    --lf-paper: #1c1b19;
    --lf-margin: #252420;
    --lf-accent: #d4764e;
    --lf-accent-hover: #c06840;
    --lf-whisper: #7a756b;
    --lf-rule: #3a3830;
    --lf-ghost: #9e978c;
  }
}

/* ── Global Reset ── */
body {
  margin: 0;
  background: var(--lf-paper);
  color: var(--lf-ink);
  font-family: var(--lf-font-sans);
  -webkit-font-smoothing: antialiased;
}
```

- [ ] **Step 2: Import tokens in popup entry**

In `apps/extension/entrypoints/popup/main.ts`, add before the app mount:

```ts
import '../../src/ui/tokens.css'
```

- [ ] **Step 3: Import tokens in options entry**

In `apps/extension/entrypoints/options/main.ts`, add before the app mount:

```ts
import '../../src/ui/tokens.css'
```

- [ ] **Step 4: Verify dev server starts**

Run: `pnpm dev`
Expected: No build errors, extension loads in browser

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/ui/tokens.css apps/extension/entrypoints/popup/main.ts apps/extension/entrypoints/options/main.ts
git commit -m "feat: add design tokens CSS foundation"
```

---

### Task 2: Shared Button Component

**Files:**
- Create: `apps/extension/src/ui/LfButton.vue`

**Purpose:** Reusable button with primary, ghost, danger, and test variants.

**Produces:** `LfButton` component used by popup and options.

- [ ] **Step 1: Create LfButton component**

```vue
<script setup lang="ts">
defineProps<{
  label: string
  variant?: 'primary' | 'ghost' | 'danger' | 'danger-confirm' | 'test'
  disabled?: boolean
}>()

defineEmits<{
  click: []
}>()
</script>

<template>
  <button
    :class="['lf-btn', variant && `lf-btn--${variant}`]"
    :disabled="disabled"
    @click="$emit('click')"
  >
    {{ label }}
  </button>
</template>

<style scoped>
.lf-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: var(--lf-btn-h-primary);
  border: 1px solid var(--lf-rule);
  border-radius: var(--lf-radius);
  padding: 0 14px;
  background: transparent;
  color: var(--lf-ink);
  font-family: var(--lf-font-sans);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
  letter-spacing: 0.02em;
}

.lf-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

/* Primary */
.lf-btn--primary {
  height: var(--lf-btn-h-primary);
  width: 100%;
  border-color: var(--lf-accent);
  background: var(--lf-accent);
  color: #ffffff;
}

.lf-btn--primary:hover:not(:disabled) {
  background: var(--lf-accent-hover);
  border-color: var(--lf-accent-hover);
}

/* Ghost */
.lf-btn--ghost {
  height: var(--lf-btn-h-secondary);
  flex: 1;
  border-color: var(--lf-rule);
  background: transparent;
  color: var(--lf-ghost);
  font-size: 12px;
}

.lf-btn--ghost:hover:not(:disabled) {
  border-color: var(--lf-whisper);
  color: var(--lf-ink);
}

/* Danger */
.lf-btn--danger {
  border-color: var(--lf-accent);
  background: var(--lf-accent);
  color: #ffffff;
}

.lf-btn--danger:hover:not(:disabled) {
  background: var(--lf-accent-hover);
  border-color: var(--lf-accent-hover);
}

/* Danger Confirm */
.lf-btn--danger-confirm {
  border-color: #991b1b;
  background: #991b1b;
  color: #ffffff;
}

/* Test */
.lf-btn--test {
  height: var(--lf-btn-h-small);
  padding: 0 14px;
  border-color: var(--lf-rule);
  background: transparent;
  color: var(--lf-ghost);
  font-size: 12px;
  flex-shrink: 0;
  margin-left: auto;
}

.lf-btn--test:hover:not(:disabled) {
  border-color: var(--lf-whisper);
  color: var(--lf-ink);
}
</style>
```

- [ ] **Step 2: Verify build compiles**

Run: `pnpm typecheck`
Expected: No errors (component has no consumers yet)

- [ ] **Step 3: Commit**

```bash
git add apps/extension/src/ui/LfButton.vue
git commit -m "feat: add shared LfButton component"
```

---

### Task 3: Shared FormField Component

**Files:**
- Create: `apps/extension/src/ui/LfFormField.vue`

**Purpose:** Reusable form field (label + input/select/checkbox).

**Produces:** `LfFormField` component used by options page.

- [ ] **Step 1: Create LfFormField component**

```vue
<script setup lang="ts">
defineProps<{
  label: string
  type?: 'text' | 'password' | 'url' | 'number' | 'select' | 'checkbox'
  modelValue?: string | number | boolean
  placeholder?: string
  disabled?: boolean
  options?: { value: string | number; label: string }[]
  min?: number
  max?: number
  step?: number
}>()

defineEmits<{
  'update:modelValue': [value: string | number | boolean]
}>()
</script>

<template>
  <label :class="['lf-field', type === 'checkbox' && 'lf-field--check']">
    <span class="lf-field__label">{{ label }}</span>

    <template v-if="type === 'select'">
      <select
        class="lf-field__select"
        :value="modelValue"
        :disabled="disabled"
        @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
      >
        <option
          v-for="opt in options"
          :key="opt.value"
          :value="opt.value"
        >
          {{ opt.label }}
        </option>
      </select>
    </template>

    <template v-else-if="type === 'checkbox'">
      <input
        class="lf-field__checkbox"
        type="checkbox"
        :checked="!!modelValue"
        :disabled="disabled"
        @change="$emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
      />
    </template>

    <template v-else>
      <input
        class="lf-field__input"
        :type="type ?? 'text'"
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        :min="min"
        :max="max"
        :step="step"
        autocomplete="off"
        @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />
    </template>
  </label>
</template>

<style scoped>
.lf-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.lf-field--check {
  flex-direction: row;
  align-items: center;
  gap: 9px;
}

.lf-field__label {
  color: var(--lf-ghost);
  font-size: 12px;
  font-weight: 600;
}

.lf-field__input,
.lf-field__select {
  height: var(--lf-input-h);
  box-sizing: border-box;
  width: 100%;
  border: 1px solid var(--lf-rule);
  border-radius: var(--lf-radius);
  padding: 0 11px;
  background: var(--lf-paper);
  color: var(--lf-ink);
  font-family: var(--lf-font-sans);
  font-size: 13px;
  transition: border-color 0.15s;
}

.lf-field__input:focus,
.lf-field__select:focus {
  outline: none;
  border-color: var(--lf-accent);
}

.lf-field__checkbox {
  width: 16px;
  height: 16px;
  accent-color: var(--lf-accent);
}
</style>
```

- [ ] **Step 2: Verify build compiles**

Run: `pnpm typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/extension/src/ui/LfFormField.vue
git commit -m "feat: add shared LfFormField component"
```

---

### Task 4: Shared NavItem Component

**Files:**
- Create: `apps/extension/src/ui/LfNavItem.vue`

**Purpose:** Sidebar navigation item with accent left-border active state.

**Produces:** `LfNavItem` component used by options page.

- [ ] **Step 1: Create LfNavItem component**

```vue
<script setup lang="ts">
defineProps<{
  label: string
  active?: boolean
}>()

defineEmits<{
  click: []
}>()
</script>

<template>
  <button
    class="lf-nav-item"
    :class="{ 'lf-nav-item--active': active }"
    :aria-current="active ? 'page' : undefined"
    type="button"
    @click="$emit('click')"
  >
    {{ label }}
  </button>
</template>

<style scoped>
.lf-nav-item {
  display: block;
  width: 100%;
  padding: 8px 24px;
  border: none;
  border-radius: var(--lf-radius);
  background: transparent;
  color: var(--lf-whisper);
  font-family: var(--lf-font-sans);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  position: relative;
  transition: color 0.15s;
}

.lf-nav-item:hover {
  color: var(--lf-ghost);
}

.lf-nav-item--active {
  color: var(--lf-ink);
}

.lf-nav-item--active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 4px;
  bottom: 4px;
  width: 2px;
  background: var(--lf-accent);
}
</style>
```

- [ ] **Step 2: Verify build compiles**

Run: `pnpm typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/extension/src/ui/LfNavItem.vue
git commit -m "feat: add shared LfNavItem component"
```

---

### Task 5: Shared LanguagePair Component

**Files:**
- Create: `apps/extension/src/ui/LfLanguagePair.vue`

**Purpose:** The signature element — source and target languages displayed as serif text with em-dash bridge.

**Produces:** `LfLanguagePair` component used by popup.

- [ ] **Step 1: Create LfLanguagePair component**

```vue
<script setup lang="ts">
defineProps<{
  sourceLabel: string
  targetLabel: string
  disabled?: boolean
}>()

defineEmits<{
  'update:target': [value: string]
}>()
</script>

<template>
  <div class="lf-lang-pair">
    <span class="lf-lang-pair__source">{{ sourceLabel }}</span>
    <span class="lf-lang-pair__dash" aria-hidden="true">—</span>
    <span class="lf-lang-pair__target">
      <select
        class="lf-lang-pair__select"
        :disabled="disabled"
        @change="$emit('update:target', ($event.target as HTMLSelectElement).value)"
      >
        <option selected disabled>{{ targetLabel }}</option>
      </select>
      <span class="lf-lang-pair__target-display" aria-hidden="true">{{ targetLabel }}</span>
    </span>
  </div>
</template>

<style scoped>
.lf-lang-pair {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 12px;
  padding: 16px 0;
  border-top: 1px solid var(--lf-rule);
  border-bottom: 1px solid var(--lf-rule);
}

.lf-lang-pair__source {
  font-family: var(--lf-font-serif);
  font-size: 20px;
  color: var(--lf-ghost);
}

.lf-lang-pair__dash {
  font-family: var(--lf-font-serif);
  font-size: 20px;
  color: var(--lf-whisper);
}

.lf-lang-pair__target {
  position: relative;
  font-family: var(--lf-font-serif);
  font-size: 20px;
  color: var(--lf-ink);
  cursor: pointer;
}

.lf-lang-pair__select {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
  font-family: inherit;
  font-size: inherit;
}

.lf-lang-pair__target-display {
  pointer-events: none;
  border-bottom: 1px solid transparent;
  transition: border-color 0.15s;
}

.lf-lang-pair__target:hover .lf-lang-pair__target-display {
  border-bottom-color: var(--lf-accent);
}
</style>
```

- [ ] **Step 2: Verify build compiles**

Run: `pnpm typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/extension/src/ui/LfLanguagePair.vue
git commit -m "feat: add shared LfLanguagePair component"
```

---

### Task 6: Restyle Popup

**Files:**
- Modify: `apps/extension/entrypoints/popup/App.vue`

**Purpose:** Replace all hardcoded styles with token references, use shared components, apply the 书页批注 design.

**Consumes:** `LfButton`, `LfLanguagePair` from Tasks 2, 5

- [ ] **Step 1: Update the popup template**

Replace the `<template>` section in `apps/extension/entrypoints/popup/App.vue`:

```vue
<template>
  <main class="popup">
    <header class="header">
      <h1>LingoFlow</h1>
      <button
        class="icon-button"
        :aria-label="copy('popup.settings')"
        :title="copy('popup.settings')"
        @click="openSettings"
      >
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="10" cy="10" r="3" />
          <path d="M10 1.5v2M10 16.5v2M1.5 10h2M16.5 10h2M3.4 3.4l1.4 1.4M15.2 15.2l1.4 1.4M3.4 16.6l1.4-1.4M15.2 4.8l1.4-1.4" />
        </svg>
      </button>
    </header>

    <p class="status" aria-live="polite">{{ statusLabel }}</p>

    <section v-if="loading" class="loading-indicator">
      <p>{{ copy("popup.loading") }}</p>
    </section>

    <lf-language-pair
      :source-label="copy('popup.autoDetect')"
      :target-label="targetLanguageName"
      :disabled="busy || progress.status === 'translating'"
      @update:target="onTargetChange"
    />

    <div v-if="progress.status === 'translating'" class="progress-line">
      <div class="progress-fill" :style="{ width: `${completion}%` }" />
    </div>

    <div class="progress-stats" v-if="progress.status === 'translating'">
      <span>{{ copy('popup.progress') }} {{ progress.translatedBlocks + progress.failedBlocks }}/{{ progress.totalBlocks }}</span>
      <span>{{ completion }}%</span>
    </div>

    <section v-else-if="summary.providerConfigured && progress.status !== 'idle'" class="result-summary">
      <span>{{ statusLabel }}</span>
      <span>{{ progress.translatedBlocks }}/{{ progress.totalBlocks }}</span>
    </section>

    <p v-if="userMessage" class="message" aria-live="polite">{{ userMessage }}</p>
    <p v-if="cacheMessage" class="message" aria-live="polite">{{ cacheMessage }}</p>

    <div class="actions">
      <lf-button
        v-if="summary.providerConfigured"
        variant="primary"
        :label="primaryActionLabel"
        :disabled="busy || progress.status === 'translating'"
        @click="translatePage"
      />
      <lf-button
        v-else
        variant="primary"
        :label="copy('popup.configureProvider')"
        @click="openSettings"
      />
      <div v-if="hasTranslations" class="secondary-actions">
        <lf-button
          variant="ghost"
          :label="copy('popup.clearTranslation')"
          :disabled="busy"
          @click="clearTranslation"
        />
        <lf-button
          variant="ghost"
          :label="copy('popup.clearSiteCache')"
          :disabled="busy"
          @click="clearSiteCache"
        />
      </div>
    </div>
  </main>
</template>
```

- [ ] **Step 2: Add imports and helper to the script**

Add at the top of `<script setup>`:

```ts
import LfButton from '../../src/ui/LfButton.vue'
import LfLanguagePair from '../../src/ui/LfLanguagePair.vue'
```

Add helper function (after existing functions):

```ts
function onTargetChange(value: string) {
  pendingTargetLang.value = value
  targetSelectionTouched.value = true
}
```

- [ ] **Step 3: Replace the style section**

Replace the entire `<style scoped>` block:

```vue
<style scoped>
.popup {
  width: 320px;
  box-sizing: border-box;
  padding: 20px;
  background: var(--lf-paper);
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

h1 {
  margin: 0;
  font-family: var(--lf-font-serif);
  font-size: 16px;
  font-weight: 400;
  line-height: 1.2;
}

.status {
  margin: 0 0 20px;
  color: var(--lf-whisper);
  font-size: 12px;
}

.icon-button {
  width: 34px;
  min-height: 34px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--lf-whisper);
  cursor: pointer;
  transition: color 0.15s;
}

.icon-button:hover {
  color: var(--lf-ghost);
}

.progress-line {
  height: 2px;
  margin-top: 20px;
  background: var(--lf-rule);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--lf-accent);
  transition: width 0.3s ease;
}

.progress-stats {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  color: var(--lf-whisper);
  font-size: 12px;
}

.result-summary {
  display: flex;
  justify-content: space-between;
  margin-top: 20px;
  padding: 12px 0;
  border-top: 1px solid var(--lf-rule);
  border-bottom: 1px solid var(--lf-rule);
  font-size: 12px;
  color: var(--lf-ghost);
}

.message {
  margin-top: 12px;
  color: var(--lf-accent);
  font-size: 12px;
  line-height: 1.45;
}

.actions {
  margin-top: 20px;
}

.secondary-actions {
  display: flex;
  gap: 12px;
  margin-top: 12px;
}

.loading-indicator {
  margin-top: 12px;
  padding: 12px;
  text-align: center;
  color: var(--lf-ghost);
  font-size: 13px;
}
</style>
```

- [ ] **Step 4: Remove old body style**

The global body style is now in `tokens.css`. Remove the `:global(body)` rule that was in the popup's `<style scoped>` block (it was removed in Step 3).

- [ ] **Step 5: Build and verify**

Run: `pnpm typecheck && pnpm build`
Expected: No errors, popup renders with new design

- [ ] **Step 6: Commit**

```bash
git add apps/extension/entrypoints/popup/App.vue
git commit -m "feat: restyle popup with 书页批注 design tokens"
```

---

### Task 7: Restyle Options Page

**Files:**
- Modify: `apps/extension/entrypoints/options/App.vue`

**Purpose:** Replace all hardcoded styles with token references, use shared components, apply the 书页批注 design.

**Consumes:** `LfButton`, `LfFormField`, `LfNavItem` from Tasks 2, 3, 4

- [ ] **Step 1: Add component imports**

Add at the top of `<script setup>`:

```ts
import LfButton from '../../src/ui/LfButton.vue'
import LfFormField from '../../src/ui/LfFormField.vue'
import LfNavItem from '../../src/ui/LfNavItem.vue'
```

- [ ] **Step 2: Replace the template**

Replace the entire `<template>` section:

```vue
<template>
  <main class="page">
    <header class="masthead">
      <div class="masthead-left">
        <h1>{{ copy('options.title') }}</h1>
        <p class="masthead-sub">{{ copy('options.subtitle') }}</p>
      </div>
      <div class="masthead-right">
        <span v-if="message" class="message" aria-live="polite">{{ message }}</span>
        <lf-button
          variant="primary"
          :label="copy('options.save')"
          :disabled="busy || !dirty"
          @click="save"
        />
      </div>
    </header>

    <div class="settings-shell">
      <aside class="settings-nav" aria-label="Settings sections">
        <lf-nav-item
          v-for="section in (['languages', 'providers', 'storage', 'advanced'] as SettingsSection[])"
          :key="section"
          :label="copy(`options.${section}`)"
          :active="activeSection === section"
          @click="activeSection = section"
        />
      </aside>

      <div class="settings-content">
        <!-- Languages Section -->
        <section v-if="activeSection === 'languages'">
          <h2>{{ copy('options.languages') }}</h2>
          <div class="form-grid">
            <lf-field
              :label="copy('options.targetLanguage')"
              type="select"
              :model-value="settings.targetLang"
              :options="targetLanguages.map(l => ({ value: l.code, label: getLanguageLabel(l.code, uiLocale) }))"
              @update:model-value="settings.targetLang = String($event)"
            />
            <lf-field
              :label="copy('options.sourceLanguage')"
              type="select"
              :model-value="settings.sourceLang"
              :options="sourceLanguages.map(l => ({ value: l.code, label: l.code === 'auto' ? copy('options.autoDetect') : getLanguageLabel(l.code, uiLocale) }))"
              @update:model-value="settings.sourceLang = String($event)"
            />
            <lf-field
              :label="copy('options.interfaceLanguage')"
              type="select"
              :model-value="settings.interfaceLocale"
              :options="[
                { value: 'auto', label: copy('options.followBrowser') },
                { value: 'zh-Hans', label: '简体中文' },
                { value: 'en', label: 'English' },
              ]"
              @update:model-value="settings.interfaceLocale = String($event) as UiLocale"
            />
          </div>
        </section>

        <!-- Providers Section -->
        <section v-else-if="activeSection === 'providers'">
          <div class="section-heading">
            <h2>{{ copy('options.providers') }}</h2>
            <span class="status-mark" :data-ready="selectedProviderConfigured">
              {{ selectedProviderConfigured ? '✓' : '✗' }}
            </span>
          </div>
          <p class="section-intro">
            {{ selectedProviderConfigured ? copy('options.providerConfigured') : copy('options.providerIncomplete') }}
          </p>

          <div class="form-grid">
            <lf-field
              :label="copy('options.defaultProvider')"
              type="select"
              :model-value="settings.defaultProviderId"
              :options="Object.entries(settings.providers).map(([id, c]) => ({ value: id, label: c.name }))"
              @update:model-value="settings.defaultProviderId = String($event)"
            />
            <lf-field
              :label="copy('options.fallbackProvider')"
              type="select"
              :model-value="settings.fallbackProviderId"
              :options="[{ value: '', label: copy('options.none') }, ...Object.entries(settings.providers).map(([id, c]) => ({ value: id, label: c.name }))]"
              @update:model-value="settings.fallbackProviderId = String($event)"
            />
          </div>

          <div class="form-divider"></div>

          <div class="provider-fields" v-if="activeProvider">
            <template v-for="field in activeProviderFields" :key="field.key">
              <lf-field
                :label="field.label"
                :type="field.type as 'text' | 'password' | 'url'"
                :placeholder="field.placeholder"
                :model-value="activeProvider.values[field.key] ?? ''"
                @update:model-value="activeProvider.values[field.key] = String($event)"
              />
            </template>
          </div>

          <div class="form-divider" v-if="activeProvider && isOpenAICompatibleProvider"></div>

          <div class="provider-speed-controls" v-if="activeProvider && isOpenAICompatibleProvider">
            <lf-field
              :label="copy('options.reasoningEffort')"
              type="select"
              :model-value="activeProvider.values.reasoningEffort ?? 'auto'"
              :options="reasoningEffortOptions.map(e => ({ value: e, label: copy(reasoningEffortCopyKey(e)) }))"
              @update:model-value="activeProvider.values.reasoningEffort = String($event)"
            />
            <lf-field
              :label="copy('options.disableThinking')"
              type="checkbox"
              :model-value="activeProvider.values.disableThinking === 'true'"
              @update:model-value="activeProvider.values.disableThinking = String($event)"
            />
          </div>

          <div class="form-divider"></div>

          <div class="provider-actions">
            <lf-button
              v-if="Object.keys(settings.providers).length > 1"
              variant="danger"
              :label="copy('options.removeProvider')"
              @click="removeProvider(settings.defaultProviderId)"
            />
            <div class="add-provider-area" v-if="availablePresets.length > 0">
              <lf-button
                variant="ghost"
                :label="copy('options.addProvider')"
                @click="showAddProviderMenu = !showAddProviderMenu"
              />
              <div v-if="showAddProviderMenu" class="add-provider-menu">
                <button
                  v-for="preset in availablePresets"
                  :key="preset.id"
                  class="menu-item"
                  type="button"
                  @click="addProvider(preset.id)"
                >
                  {{ preset.name }}
                </button>
                <button class="menu-item" type="button" @click="openCustomProviderForm">
                  {{ copy('options.customOpenAI') }}
                </button>
              </div>
            </div>
          </div>

          <div v-if="showCustomProviderForm" class="custom-provider-form">
            <h3>{{ copy('options.customOpenAI') }}</h3>
            <div class="form-grid">
              <lf-field
                :label="copy('options.customProviderName')"
                v-model="customProviderName"
                placeholder="e.g. DeepL, Ollama, LM Studio"
              />
              <lf-field
                label="Base URL"
                type="url"
                v-model="customProviderBaseUrl"
                placeholder="http://localhost:11434/v1"
              />
              <lf-field
                label="API Key"
                type="password"
                v-model="customProviderApiKey"
                placeholder="Optional"
              />
              <lf-field
                label="Model"
                v-model="customProviderModel"
                placeholder="gpt-4o-mini"
              />
            </div>
            <div class="custom-provider-actions">
              <lf-button variant="ghost" :label="copy('options.cancel')" @click="cancelCustomProvider" />
              <lf-button
                variant="primary"
                :label="copy('options.addProvider')"
                :disabled="!customProviderName.trim() || !customProviderBaseUrl.trim() || !customProviderModel.trim()"
                @click="confirmCustomProvider"
              />
            </div>
          </div>

          <div class="form-divider"></div>

          <div class="connection-test">
            <div>
              <strong>{{ copy('options.testConnection') }}</strong>
              <p>{{ copy('options.connectionTestDescription') }}</p>
            </div>
            <lf-button
              variant="test"
              :label="testingConnection ? copy('options.testingConnection') : copy('options.testConnection')"
              :disabled="testingConnection"
              @click="testConnection"
            />
            <p
              v-if="connectionResult"
              class="connection-result"
              :data-success="connectionResult.ok"
              aria-live="polite"
            >
              {{ connectionResult.ok ? '✓' : '✗' }} {{ connectionMessage }}
            </p>
          </div>
        </section>

        <!-- Storage Section -->
        <section v-else-if="activeSection === 'storage'">
          <h2>{{ copy('options.storage') }}</h2>
          <lf-field
            :label="copy('options.cacheEnabled')"
            type="checkbox"
            v-model="settings.cacheEnabled"
          />
          <div class="form-divider"></div>
          <div class="storage-actions">
            <lf-button
              variant="danger"
              :class="{ 'danger-confirm': confirmClearAll }"
              :label="confirmClearAll ? copy('options.confirmClearAll') : copy('options.clearAllCache')"
              :disabled="busy"
              @click="confirmClearAll ? clearAllCache() : (confirmClearAll = true)"
            />
          </div>
        </section>

        <!-- Advanced Section -->
        <section v-else>
          <h2>{{ copy('options.advanced') }}</h2>
          <div class="form-grid">
            <lf-field
              :label="copy('options.renderMode')"
              type="select"
              :model-value="settings.renderMode"
              :options="[{ value: 'below-original', label: copy('options.belowOriginal') }]"
              @update:model-value="settings.renderMode = String($event) as any"
            />
            <lf-field
              :label="copy('options.maxCacheItems')"
              type="number"
              :model-value="settings.maxCacheItems"
              :min="1"
              @update:model-value="settings.maxCacheItems = Number($event)"
            />
            <lf-field
              :label="copy('options.translationConcurrency')"
              type="number"
              :model-value="settings.translationConcurrency"
              :min="1"
              :max="6"
              :step="1"
              @update:model-value="settings.translationConcurrency = Number($event)"
            />
          </div>
        </section>
      </div>
    </div>
  </main>
</template>
```

- [ ] **Step 3: Replace the style section**

Replace the entire `<style scoped>` block:

```vue
<style scoped>
.page {
  width: min(720px, calc(100vw - 40px));
  margin: 0 auto;
  padding: 36px 0 56px;
}

.masthead {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 24px;
}

.masthead-left {
  flex: 1;
  min-width: 0;
}

.masthead-right {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-shrink: 0;
}

h1, h2, p {
  margin: 0;
}

h1 {
  font-family: var(--lf-font-serif);
  font-size: 22px;
  font-weight: 400;
  line-height: 1.15;
}

h2 {
  font-family: var(--lf-font-serif);
  font-size: 16px;
  font-weight: 400;
}

.masthead-sub {
  margin-top: 4px;
  color: var(--lf-whisper);
  font-size: 13px;
}

.message {
  color: var(--lf-accent);
  font-size: 13px;
  font-weight: 600;
}

.settings-shell {
  display: grid;
  grid-template-columns: 160px minmax(0, 1fr);
  min-height: 400px;
  border: 1px solid var(--lf-rule);
  background: var(--lf-paper);
}

.settings-nav {
  display: grid;
  align-content: start;
  padding: 20px 0;
  border-right: 1px solid var(--lf-rule);
}

.settings-content {
  padding: 24px 28px;
}

section {
  display: grid;
  gap: 20px;
}

.section-heading {
  display: flex;
  align-items: center;
  gap: 10px;
}

.section-intro {
  color: var(--lf-whisper);
  font-size: 13px;
}

.status-mark {
  font-size: 14px;
  font-weight: 700;
  color: var(--lf-accent);
}

.status-mark[data-ready="true"] {
  color: #4a7c59;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px 20px;
}

.form-divider {
  height: 1px;
  background: var(--lf-rule);
  margin: 4px 0;
}

.provider-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px 20px;
}

.provider-speed-controls {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px 20px;
}

.provider-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.add-provider-area {
  position: relative;
}

.add-provider-menu {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 10;
  margin-top: 4px;
  min-width: 200px;
  border: 1px solid var(--lf-rule);
  background: var(--lf-paper);
  overflow: hidden;
}

.menu-item {
  display: block;
  width: 100%;
  min-height: 38px;
  border: none;
  background: transparent;
  color: var(--lf-ink);
  font-family: var(--lf-font-sans);
  font-size: 13px;
  font-weight: 400;
  text-align: left;
  padding: 0 14px;
  cursor: pointer;
  transition: background 0.15s;
}

.menu-item:hover {
  background: var(--lf-margin);
}

.custom-provider-form {
  padding: 20px;
  border: 1px solid var(--lf-rule);
  background: var(--lf-margin);
}

.custom-provider-form h3 {
  margin: 0 0 16px;
  font-family: var(--lf-font-serif);
  font-size: 15px;
  font-weight: 400;
}

.custom-provider-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 16px;
}

.connection-test {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px 18px;
}

.connection-test p {
  margin-top: 5px;
  color: var(--lf-whisper);
  font-size: 13px;
}

.connection-result {
  grid-column: 1 / -1;
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--lf-accent);
}

.connection-result[data-success="true"] {
  color: #4a7c59;
}

.storage-actions {
  padding-top: 4px;
}

/* ── Responsive ── */
@media (max-width: 640px) {
  .page {
    width: min(100% - 24px, 720px);
    padding-top: 20px;
  }

  .settings-shell,
  .form-grid,
  .provider-fields,
  .provider-speed-controls,
  .connection-test {
    grid-template-columns: 1fr;
  }

  .settings-nav {
    display: flex;
    flex-wrap: wrap;
    gap: 0;
    border-right: none;
    border-bottom: 1px solid var(--lf-rule);
    padding: 12px 0;
  }
}
</style>
```

- [ ] **Step 4: Remove old body style**

The global body style is now in `tokens.css`. The `:global(body)` rule was removed in Step 3.

- [ ] **Step 5: Build and verify**

Run: `pnpm typecheck && pnpm build`
Expected: No errors, options page renders with new design

- [ ] **Step 6: Commit**

```bash
git add apps/extension/entrypoints/options/App.vue
git commit -m "feat: restyle options page with 书页批注 design tokens"
```

---

### Task 8: Update Renderer Styles

**Files:**
- Modify: `packages/renderer/src/index.ts`

**Purpose:** Update the injected in-page translation CSS to match the new design (2px rust border, muted text color, dark mode support).

- [ ] **Step 1: Update the injected CSS in `injectLingoFlowStyles`**

Replace the `style.textContent` in the `injectLingoFlowStyles` function:

```ts
style.textContent = `
  .lingoflow-translation {
    margin-top: 0.35em;
    margin-bottom: 0.85em;
    padding-left: 0.75em;
    border-left: 2px solid #c05a2e;
    color: #6b6560;
    font-size: 0.95em;
    line-height: 1.65;
    word-break: break-word;
  }
  .lingoflow-translation-inline {
    display: inline;
    margin: 0;
    padding-left: 0;
    border-left: 0;
  }
  .lingoflow-translation-block {
    display: block;
  }
  @media (prefers-color-scheme: dark) {
    .lingoflow-translation {
      border-left-color: #d4764e;
      color: #9e978c;
    }
  }
`
```

- [ ] **Step 2: Build and verify**

Run: `pnpm build`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/renderer/src/index.ts
git commit -m "feat: update renderer styles with 书页批注 palette"
```

---

### Task 9: Integration Test

**Files:** None (verification only)

**Purpose:** Verify all changes work together.

- [ ] **Step 1: Run full typecheck**

Run: `pnpm typecheck`
Expected: No errors

- [ ] **Step 2: Run unit tests**

Run: `pnpm test`
Expected: All tests pass

- [ ] **Step 3: Build extension**

Run: `pnpm build`
Expected: Build succeeds, output in `apps/extension/output/chrome-mv3`

- [ ] **Step 4: Manual verification checklist**

Load the extension in Chrome and verify:
- [ ] Popup shows serif "LingoFlow" title, no "LF" badge
- [ ] Language pair displays as `English — 中文` in serif
- [ ] Progress shows as 2px accent-colored line
- [ ] Ghost buttons appear only when translations exist
- [ ] Options page max-width is 720px
- [ ] Sidebar nav has accent left-border on active item
- [ ] Form fields have no border-radius
- [ ] Connection test result uses ✓/✗ prefix
- [ ] In-page translations show 2px rust left border
- [ ] Dark mode works correctly in popup, options, and in-page

- [ ] **Step 5: Commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: integration fixes for 书页批注 redesign"
```
