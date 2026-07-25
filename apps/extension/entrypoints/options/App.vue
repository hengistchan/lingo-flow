<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, toRaw, watch } from 'vue'
import LfButton from '../../src/ui/LfButton.vue'
import LfFormField from '../../src/ui/LfFormField.vue'
import LfNavItem from '../../src/ui/LfNavItem.vue'
import ProviderConfiguration from '../../src/ui/ProviderConfiguration.vue'
import {
  getProviderEndpoint,
  hasRuntimeApi,
  providerOriginPattern,
  requestProviderOriginAccess,
} from '../../src/provider-access'
import ShortcutSetting from './ShortcutSetting.vue'
import InteractiveRuleBuilder from './InteractiveRuleBuilder.vue'
import TerminologySection from './TerminologySection.vue'
import { diagnosePage, ensureContentRuntime, findAdaptableTab } from './page-adaptation-runtime'
import { cloneSerializable } from './serialization'
import { useRuleCompatibility } from './useRuleCompatibility'
import {
  getLanguageLabel,
  getSourceLanguageOptions,
  getTargetLanguageOptions,
  resolveUiLocale,
  t,
  sendChromeMessage,
} from '@lingoflow/shared'
import { DEFAULT_SETTINGS } from '@lingoflow/settings'
import { SITE_RULES } from '@lingoflow/rules'
import type {
  AppSettings,
  PageDiagnostics,
  ProviderConfig,
  RootDiagnostic,
  UiLocale,
  UserSiteRule,
} from '@lingoflow/types'

type SettingsSection = 'general' | 'providers' | 'terminology' | 'localData' | 'siteRules'

const settings = reactive<AppSettings>(structuredClone(DEFAULT_SETTINGS))
const savedSettings = ref<AppSettings>(structuredClone(DEFAULT_SETTINGS))
const activeSection = ref<SettingsSection>('general')
const message = ref('')
const busy = ref(false)
const confirmClearAll = ref(false)
const browserLocale = resolveUiLocale(globalThis.navigator?.language)
const sourceLanguages = getSourceLanguageOptions()
const targetLanguages = getTargetLanguageOptions()

const userRules = ref<UserSiteRule[]>([])
const editingRule = ref<UserSiteRule | null>(null)
const editingOriginalRuleId = ref<string | null>(null)
const editingRuleJson = ref('')
const editingRuleErrors = ref<string[]>([])
const showRuleEditor = ref(false)
const ruleEditorDialog = ref<HTMLElement>()
let ruleEditorReturnFocus: HTMLElement | null = null
const diagnosticsResult = ref<PageDiagnostics | null>(null)
const testingPage = ref(false)
const {
  revalidate: revalidateRule,
  isChecking: isCheckingRuleCompatibility,
} = useRuleCompatibility()

const uiLocale = computed<UiLocale>(() =>
  settings.interfaceLocale === 'auto' ? browserLocale : settings.interfaceLocale,
)
const dirty = computed(() => JSON.stringify(settings) !== JSON.stringify(savedSettings.value))
const builtinRules = computed(() => SITE_RULES)

function formatRootDiagnostic(root: RootDiagnostic): string {
  const score = typeof root.score === 'number' ? ` · score ${root.score}` : ''
  const source = root.sourceSelector ? ` · ${root.sourceSelector}` : ''
  return `${root.selector}${score}${source}`
}

function formatRejectedRoot(root: RootDiagnostic): string {
  const reason = root.rejectReason ? ` · ${root.rejectReason}` : ''
  return `${formatRootDiagnostic(root)}${reason}`
}

function diagnosticTranslationPosition(diagnostics: PageDiagnostics): string {
  const behavior = diagnostics.rule.behavior
  if (!behavior || typeof behavior !== 'object') return 'after'
  const value = (behavior as { translationPosition?: unknown }).translationPosition
  return value === 'before' ? 'before' : 'after'
}

watch(dirty, hasUnsavedChanges => {
  if (hasUnsavedChanges) message.value = ''
})
watch(() => settings.uiTheme, applyInterfaceTheme, { immediate: true })
watch(confirmClearAll, (val) => {
  if (val) setTimeout(() => { confirmClearAll.value = false }, 3000)
})
watch(showRuleEditor, async open => {
  if (open) {
    ruleEditorReturnFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    await nextTick()
    ruleEditorDialog.value?.focus()
  } else {
    ruleEditorReturnFocus?.focus()
    ruleEditorReturnFocus = null
  }
})

function applyInterfaceTheme(theme: AppSettings['uiTheme']) {
  const root = document.documentElement
  root.classList.remove('dark', 'light')
  if (theme !== 'system') root.classList.add(theme)
}

function updateInterfaceTheme(value: string | number | boolean) {
  const theme = String(value)
  if (theme === 'system' || theme === 'light' || theme === 'dark') settings.uiTheme = theme
}

onMounted(() => {
  loadSettings()
  loadUserRules()
})

const handleBeforeUnload = (event: BeforeUnloadEvent) => {
  if (dirty.value) {
    event.preventDefault()
  }
}
window.addEventListener('beforeunload', handleBeforeUnload)
onUnmounted(() => window.removeEventListener('beforeunload', handleBeforeUnload))

async function loadSettings() {
  busy.value = true
  message.value = ''

  try {
    if (hasRuntimeApi()) {
      Object.assign(settings, await sendChromeMessage<AppSettings>({ type: 'settings/get' }))
    }
    savedSettings.value = structuredClone(toRaw(settings))
  } catch (error) {
    message.value = error instanceof Error ? error.message : String(error)
  } finally {
    busy.value = false
  }
}

async function save() {
  if (!dirty.value) return

  busy.value = true
  message.value = ''

  try {
    const config = settings.providers[settings.defaultProviderId]
    const endpoint = getProviderEndpoint(config)
    if (endpoint && !providerOriginPattern(endpoint)) {
      message.value = copy('options.invalidEndpoint')
      return
    }
    const value = structuredClone(toRaw(settings))
    if (!(await requestProviderOriginAccess(getProviderEndpoint(getProviderConfig(value))))) {
      message.value = copy('options.connectionPermissionDenied')
      return
    }
    if (hasRuntimeApi()) {
      await sendChromeMessage({ type: 'settings/save', payload: { settings: value } })
    }
    savedSettings.value = value
    message.value = copy('options.saved')
  } catch (error) {
    message.value = error instanceof Error ? error.message : String(error)
  } finally {
    busy.value = false
  }
}

async function clearAllCache() {
  busy.value = true
  message.value = ''

  try {
    if (hasRuntimeApi()) {
      await sendChromeMessage({ type: 'cache/clearAll' })
    }
    message.value = copy('options.cacheCleared')
  } catch (error) {
    message.value = error instanceof Error ? error.message : String(error)
  } finally {
    busy.value = false
  }
}

function getProviderConfig(value: AppSettings): ProviderConfig {
  return value.providers[value.defaultProviderId]
}

function copy(key: Parameters<typeof t>[1], variables?: Record<string, string | number>) {
  return t(uiLocale.value, key, variables)
}

async function loadUserRules() {
  if (!hasRuntimeApi()) return
  try {
    userRules.value = await sendChromeMessage<UserSiteRule[]>({ type: 'userRules/get' })
  } catch {
    // ignore
  }
}

function createUserRule() {
  const now = new Date().toISOString()
  editingRule.value = {
    id: '',
    version: 1,
    source: 'user',
    enabled: true,
    priority: 50,
    createdAt: now,
    updatedAt: now,
    match: {},
    selectors: {},
  }
  editingRuleJson.value = JSON.stringify(editingRule.value, null, 2)
  editingOriginalRuleId.value = null
  editingRuleErrors.value = []
  showRuleEditor.value = true
}

function editUserRule(rule: UserSiteRule) {
  editingRule.value = cloneSerializable(rule)
  editingOriginalRuleId.value = rule.id
  editingRuleJson.value = JSON.stringify(rule, null, 2)
  editingRuleErrors.value = []
  showRuleEditor.value = true
}

function duplicateUserRule(rule: UserSiteRule) {
  const now = new Date().toISOString()
  editingRule.value = {
    ...cloneSerializable(rule),
    id: `${rule.id}-copy`,
    createdAt: now,
    updatedAt: now,
  }
  editingRuleJson.value = JSON.stringify(editingRule.value, null, 2)
  editingOriginalRuleId.value = null
  editingRuleErrors.value = []
  showRuleEditor.value = true
}

async function deleteUserRule(ruleId: string) {
  const previousRules = cloneSerializable(userRules.value)
  userRules.value = userRules.value.filter(r => r.id !== ruleId)
  if (!(await saveUserRulesToStorage())) {
    userRules.value = previousRules
    return
  }
  message.value = copy('options.ruleDeleted')
}

async function toggleUserRule(ruleId: string) {
  const rule = userRules.value.find(r => r.id === ruleId)
  if (rule) {
    if (!rule.enabled && rule.compatibility?.status === 'incompatible') {
      message.value = copy('options.compatibilityRecheckRequired')
      return
    }
    rule.enabled = !rule.enabled
    rule.updatedAt = new Date().toISOString()
    if (!(await saveUserRulesToStorage())) {
      rule.enabled = !rule.enabled
    }
  }
}

async function checkRuleCompatibility(rule: UserSiteRule) {
  const previousRules = cloneSerializable(userRules.value)
  try {
    const updated = await revalidateRule(cloneSerializable(rule))
    const index = userRules.value.findIndex(item => item.id === rule.id)
    if (index < 0) return
    userRules.value[index] = updated
    if (!(await saveUserRulesToStorage())) {
      userRules.value = previousRules
      return
    }
    message.value = updated.compatibility?.status === 'incompatible'
      ? copy('options.compatibilityAutoDisabled')
      : copy('options.ruleSaved')
  } catch (error) {
    userRules.value = previousRules
    message.value = `${copy('options.compatibilityCheckFailed')}: ${
      error instanceof Error ? error.message : String(error)
    }`
  }
}

function compatibilityLabel(rule: UserSiteRule): string {
  switch (rule.compatibility?.status) {
    case 'compatible': return copy('options.compatibilityCompatible')
    case 'warning': return copy('options.compatibilityWarning')
    case 'incompatible': return copy('options.compatibilityIncompatible')
    default: return copy('options.compatibilityUnchecked')
  }
}

function compatibilityCheckedAt(rule: UserSiteRule): string {
  if (!rule.compatibility?.evaluatedAt) return ''
  return copy('options.compatibilityChecked', {
    date: new Intl.DateTimeFormat(uiLocale.value, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(rule.compatibility.evaluatedAt)),
  })
}

function cancelRuleEditor() {
  showRuleEditor.value = false
  editingRule.value = null
  editingOriginalRuleId.value = null
  editingRuleErrors.value = []
}

function updateRuleFromJson() {
  try {
    const parsed = JSON.parse(editingRuleJson.value)
    editingRule.value = parsed
    editingRuleErrors.value = []
  } catch (e) {
    editingRuleErrors.value = [e instanceof Error ? e.message : 'Invalid JSON']
  }
}

function updateJsonFromRule() {
  if (editingRule.value) {
    editingRuleJson.value = JSON.stringify(editingRule.value, null, 2)
  }
}

function updateRuleField(field: string, value: any) {
  if (!editingRule.value) return
  const keys = field.split('.')
  let obj: any = editingRule.value
  for (let i = 0; i < keys.length - 1; i++) {
    if (!obj[keys[i]]) obj[keys[i]] = {}
    obj = obj[keys[i]]
  }
  obj[keys[keys.length - 1]] = value
  updateJsonFromRule()
}

async function saveEditingRule() {
  if (!editingRule.value) return

  const draft = cloneSerializable(editingRule.value)
  const validation = await validateRule(draft)
  if (!validation.valid) {
    editingRuleErrors.value = validation.errors.map(e => e.message)
    return
  }

  const now = new Date().toISOString()
  const rule = { ...draft, updatedAt: now }
  const previousRules = cloneSerializable(userRules.value)
  const idx = editingOriginalRuleId.value
    ? userRules.value.findIndex(r => r.id === editingOriginalRuleId.value)
    : -1
  if (idx >= 0) {
    userRules.value[idx] = rule
  } else {
    userRules.value.push(rule)
  }

  if (!(await saveUserRulesToStorage())) {
    userRules.value = previousRules
    return
  }
  showRuleEditor.value = false
  editingRule.value = null
  editingOriginalRuleId.value = null
  message.value = copy('options.ruleSaved')
}

async function validateRule(rule: UserSiteRule): Promise<{ valid: boolean; errors: { field: string; message: string }[] }> {
  if (!hasRuntimeApi()) {
    return { valid: !!(rule.id && rule.id.trim()), errors: rule.id?.trim() ? [] : [{ field: 'id', message: copy('options.ruleIdRequired') }] }
  }
  try {
    const result = await sendChromeMessage<{ ok: true } | { ok: false; errors: { field: string; message: string }[] }>({
      type: 'userRules/validate',
      payload: {
        rule: cloneSerializable(rule),
        existingRuleId: editingOriginalRuleId.value ?? undefined,
      },
    })
    return result.ok
      ? { valid: true, errors: [] }
      : { valid: false, errors: result.errors }
  } catch {
    return { valid: false, errors: [{ field: 'id', message: 'Validation failed' }] }
  }
}

async function saveUserRulesToStorage(rules: UserSiteRule[] = userRules.value): Promise<boolean> {
  if (!hasRuntimeApi()) return true
  try {
    const result = await sendChromeMessage<{ saved: boolean; rules: UserSiteRule[] }>({
      type: 'userRules/save',
      payload: { rules: cloneSerializable(rules) },
    })
    userRules.value = result.rules
    settings.userRules = structuredClone(result.rules)
    savedSettings.value.userRules = structuredClone(result.rules)
    return true
  } catch (error) {
    message.value = error instanceof Error ? error.message : String(error)
    return false
  }
}

async function saveInteractiveRule(rule: UserSiteRule): Promise<boolean> {
  const previousRules = cloneSerializable(userRules.value)
  const nextRules = [...previousRules, cloneSerializable(rule)]
  userRules.value = nextRules
  if (!(await saveUserRulesToStorage(nextRules))) {
    userRules.value = previousRules
    return false
  }
  message.value = copy('options.ruleSaved')
  return true
}

async function importRules() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const doc = JSON.parse(text)
      const result = await sendChromeMessage<{ imported: number; skipped: number }>({
        type: 'userRules/import',
        payload: { document: doc, mode: 'skip-duplicates' },
      })
      await loadUserRules()
      message.value = `${copy('options.rulesImported')} (${result.imported} imported, ${result.skipped} skipped)`
    } catch (e) {
      message.value = copy('options.importFailed')
    }
  }
  input.click()
}

async function exportRules() {
  try {
    const doc = await sendChromeMessage<{ schema: string; exportedAt: string; rules: UserSiteRule[] }>({
      type: 'userRules/export',
    })
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'lingoflow-user-rules.json'
    a.click()
    URL.revokeObjectURL(url)
    message.value = copy('options.rulesExported')
  } catch {
    // ignore
  }
}

async function testOnCurrentPage() {
  if (!hasRuntimeApi()) return
  testingPage.value = true
  diagnosticsResult.value = null
  try {
    const optionsTab = await chrome.tabs.getCurrent()
    const tab = await findAdaptableTab(optionsTab?.id)
    if (!tab?.id) {
      message.value = copy('options.noActiveTab')
      return
    }
    await ensureContentRuntime(tab.id)
    diagnosticsResult.value = await diagnosePage(tab.id)
  } catch (e) {
    message.value = copy('options.noActiveTab')
  } finally {
    testingPage.value = false
  }
}
</script>

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
      <aside class="settings-nav" :aria-label="copy('options.settingsSections')">
        <lf-nav-item
          v-for="section in (['general', 'providers', 'terminology', 'localData', 'siteRules'] as SettingsSection[])"
          :key="section"
          :label="copy(`options.${section}`)"
          :active="activeSection === section"
          @click="activeSection = section"
        />
      </aside>

      <div class="settings-content">
        <!-- General Section -->
        <section v-if="activeSection === 'general'">
          <h2>{{ copy('options.general') }}</h2>

          <div class="settings-group">
            <div class="settings-group__intro">
              <h3>{{ copy('options.readingLanguages') }}</h3>
              <p>{{ copy('options.readingLanguagesDescription') }}</p>
            </div>
            <div class="form-grid">
              <lf-form-field
                :label="copy('options.targetLanguage')"
                type="select"
                :model-value="settings.targetLang"
                :options="targetLanguages.map(l => ({ value: l.code, label: getLanguageLabel(l.code, uiLocale) }))"
                @update:model-value="settings.targetLang = String($event)"
              />
              <lf-form-field
                :label="copy('options.sourceLanguage')"
                type="select"
                :model-value="settings.sourceLang"
                :options="sourceLanguages.map(l => ({ value: l.code, label: l.code === 'auto' ? copy('options.autoDetect') : getLanguageLabel(l.code, uiLocale) }))"
                @update:model-value="settings.sourceLang = String($event)"
              />
            </div>
          </div>

          <div class="settings-group">
            <div class="settings-group__intro">
              <h3>{{ copy('options.interface') }}</h3>
              <p>{{ copy('options.interfaceDescription') }}</p>
            </div>
            <div class="form-grid">
              <lf-form-field
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
              <lf-form-field
                :label="copy('options.interfaceTheme')"
                type="select"
                :model-value="settings.uiTheme"
                :options="[
                  { value: 'system', label: copy('options.themeSystem') },
                  { value: 'light', label: copy('options.themeLight') },
                  { value: 'dark', label: copy('options.themeDark') },
                ]"
                @update:model-value="updateInterfaceTheme"
              />
            </div>
          </div>

          <div class="settings-group">
            <shortcut-setting
              :title="copy('options.hoverTranslation')"
              :description="copy('options.hoverTranslationDescription')"
              :shortcut-label="copy('options.hoverTranslationShortcut')"
              :manage-label="copy('options.manageShortcut')"
              :unassigned-label="copy('options.shortcutUnassigned')"
              :managed-by-browser-label="copy('options.shortcutManagedByBrowser')"
              :open-failed-label="copy('options.shortcutOpenFailed')"
              fallback-shortcut="Alt+Shift+L"
            />
          </div>
        </section>

        <!-- Providers Section -->
        <provider-configuration
          v-else-if="activeSection === 'providers'"
          :model-value="settings"
          :locale="uiLocale"
          @update:model-value="Object.assign(settings, $event)"
        />

        <terminology-section
          v-else-if="activeSection === 'terminology'"
          :glossaries="settings.glossaries"
          :locale="uiLocale"
          @update:glossaries="settings.glossaries = $event"
        />

        <!-- Local Data Section -->
        <section v-else-if="activeSection === 'localData'">
          <h2>{{ copy('options.localData') }}</h2>
          <div class="settings-group settings-group--first">
            <div class="settings-group__intro">
              <h3>{{ copy('options.translationCache') }}</h3>
              <p>{{ copy('options.cacheDescription') }}</p>
            </div>
            <div class="form-grid">
              <lf-form-field
                :label="copy('options.cacheEnabled')"
                type="checkbox"
                v-model="settings.cacheEnabled"
              />
              <lf-form-field
                :label="copy('options.maxCacheItems')"
                type="number"
                :model-value="settings.maxCacheItems"
                :disabled="!settings.cacheEnabled"
                :min="1"
                @update:model-value="settings.maxCacheItems = Number($event)"
              />
            </div>
          </div>
          <div class="storage-actions danger-zone">
            <div>
              <strong>{{ copy('options.clearAllCache') }}</strong>
              <p>{{ copy('options.clearCacheDescription') }}</p>
            </div>
            <lf-button
              variant="danger"
              :class="{ 'danger-confirm': confirmClearAll }"
              :label="confirmClearAll ? copy('options.confirmClearAll') : copy('options.clearAllCache')"
              :disabled="busy"
              @click="confirmClearAll ? clearAllCache() : (confirmClearAll = true)"
            />
          </div>
        </section>

        <!-- Site Rules Section -->
        <section v-else-if="activeSection === 'siteRules'">
          <div class="section-heading">
            <h2>{{ copy('options.siteRules') }}</h2>
          </div>

          <interactive-rule-builder
            :existing-rules="userRules"
            :locale="uiLocale"
            :save-rule="saveInteractiveRule"
          />

          <h3>{{ copy('options.builtInRules') }}</h3>
          <div class="builtin-rules-list">
            <div v-for="rule in builtinRules" :key="rule.id" class="builtin-rule-card">
              <div class="rule-card-header">
                <strong>{{ rule.id }}</strong>
                <span class="rule-badge">{{ copy('options.builtInBadge') }}</span>
              </div>
              <p class="rule-card-desc" v-if="rule.match?.matches">
                {{ rule.match.matches.join(', ') }}
              </p>
            </div>
          </div>

          <div class="form-divider"></div>

          <div class="section-heading">
            <h3>{{ copy('options.userRules') }}</h3>
            <div class="user-rules-actions">
              <lf-button variant="ghost" :label="copy('options.createUserRule')" @click="createUserRule" />
              <lf-button variant="ghost" :label="copy('options.importRules')" @click="importRules" />
              <lf-button variant="ghost" :label="copy('options.exportRules')" @click="exportRules" />
            </div>
          </div>

          <p v-if="userRules.length === 0" class="section-intro">
            {{ copy('options.noUserRules') }}
          </p>

          <div v-else class="user-rules-list">
            <div v-for="rule in userRules" :key="rule.id" class="user-rule-card" :data-disabled="!rule.enabled">
              <div class="rule-card-header">
                <strong>{{ rule.id }}</strong>
                <div class="rule-card-badges">
                  <span class="rule-badge" :data-enabled="rule.enabled">
                    {{ rule.enabled ? 'enabled' : 'disabled' }}
                  </span>
                  <span class="rule-badge">priority {{ rule.priority }}</span>
                  <span
                    class="rule-badge"
                    :data-compatibility="rule.compatibility?.status ?? 'unchecked'"
                  >
                    {{ compatibilityLabel(rule) }}
                  </span>
                </div>
              </div>
              <p class="rule-card-desc" v-if="rule.match?.matches">
                {{ rule.match.matches.join(', ') }}
              </p>
              <p v-if="compatibilityCheckedAt(rule)" class="rule-card-evidence">
                {{ compatibilityCheckedAt(rule) }}
                <template v-if="rule.compatibility?.pageUrl"> · {{ rule.compatibility.pageUrl }}</template>
              </p>
              <ul v-if="rule.compatibility?.warnings.length" class="rule-card-warnings">
                <li v-for="warning in rule.compatibility.warnings" :key="warning">{{ warning }}</li>
              </ul>
              <div class="rule-card-actions">
                <lf-button
                  variant="test"
                  :label="isCheckingRuleCompatibility(rule.id) ? copy('options.checkingCompatibility') : copy('options.checkCompatibility')"
                  :disabled="isCheckingRuleCompatibility(rule.id)"
                  @click="checkRuleCompatibility(rule)"
                />
                <lf-button variant="ghost" :label="rule.enabled ? copy('options.disable') : copy('options.enable')" @click="toggleUserRule(rule.id)" />
                <lf-button variant="ghost" :label="copy('options.editUserRule')" @click="editUserRule(rule)" />
                <lf-button variant="ghost" :label="copy('options.duplicateRule')" @click="duplicateUserRule(rule)" />
                <lf-button variant="danger" :label="copy('options.deleteRule')" @click="deleteUserRule(rule.id)" />
              </div>
            </div>
          </div>

          <div class="form-divider"></div>

          <div class="test-on-page">
            <div>
              <strong>{{ copy('options.testOnCurrentPage') }}</strong>
              <p class="section-intro">{{ copy('options.diagnosticsDescription') }}</p>
            </div>
            <lf-button
              variant="test"
              :label="testingPage ? copy('options.testingPage') : copy('options.testOnCurrentPage')"
              :disabled="testingPage"
              @click="testOnCurrentPage"
            />
          </div>

          <div v-if="diagnosticsResult" class="diagnostics-report">
            <h3>{{ copy('options.diagnosticsReport') }}</h3>
            <dl class="diagnostics-grid">
              <dt>{{ copy('options.matchedRule') }}</dt>
              <dd>{{ diagnosticsResult.rule.id }} ({{ diagnosticsResult.rule.matchedRuleIds.join(', ') }})</dd>
              <dt>{{ copy('options.rootsSelected') }}</dt>
              <dd>{{ diagnosticsResult.counts.rootsSelected }} / {{ diagnosticsResult.counts.rootsConsidered }}</dd>
              <dt>{{ copy('options.candidatesCollected') }}</dt>
              <dd>{{ diagnosticsResult.counts.collected }}</dd>
              <dt>{{ copy('options.candidatesSkipped') }}</dt>
              <dd>{{ diagnosticsResult.counts.skipped }}</dd>
              <dt>{{ copy('options.translationPosition') }}</dt>
              <dd>{{ diagnosticTranslationPosition(diagnosticsResult) }}</dd>
              <dt>{{ copy('options.activeGlossaries') }}</dt>
              <dd>{{ diagnosticsResult.terminology?.glossaryIds.join(', ') || '—' }}</dd>
              <dt>{{ copy('options.semanticsFingerprints') }}</dt>
              <dd>{{ diagnosticsResult.terminology?.semanticsFingerprints.join(', ') || '—' }}</dd>
            </dl>
            <div v-if="diagnosticsResult.topSkipReasons?.length" class="skip-reasons">
              <strong>{{ copy('options.topSkipReasons') }}</strong>
              <ul>
                <li v-for="entry in diagnosticsResult.topSkipReasons.slice(0, 5)" :key="entry.reason">
                  {{ entry.reason }}: {{ entry.count }}
                </li>
              </ul>
            </div>
            <div v-if="diagnosticsResult.roots?.length" class="root-diagnostics">
              <strong>{{ copy('options.selectedRoots') }}</strong>
              <ul>
                <li v-for="root in diagnosticsResult.roots.slice(0, 5)" :key="`selected-${root.selector}-${root.rank ?? root.score ?? 0}`">
                  {{ formatRootDiagnostic(root) }}
                </li>
              </ul>
            </div>
            <div v-if="diagnosticsResult.rejectedRoots?.length" class="root-diagnostics">
              <strong>{{ copy('options.rejectedRoots') }}</strong>
              <ul>
                <li v-for="root in diagnosticsResult.rejectedRoots.slice(0, 5)" :key="`rejected-${root.selector}-${root.rejectReason ?? ''}-${root.score ?? 0}`">
                  {{ formatRejectedRoot(root) }}
                </li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </div>
  </main>

  <!-- Rule Editor Modal -->
  <div v-if="showRuleEditor && editingRule" class="modal-overlay" @click.self="cancelRuleEditor">
    <div
      ref="ruleEditorDialog"
      class="modal-content"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rule-editor-title"
      tabindex="-1"
      @keydown.esc="cancelRuleEditor"
    >
      <h3 id="rule-editor-title">{{ editingRule.id ? copy('options.editUserRule') : copy('options.createUserRule') }}</h3>

      <div v-if="editingRuleErrors.length" class="validation-errors">
        <p v-for="(err, i) in editingRuleErrors" :key="i">{{ err }}</p>
      </div>

      <div class="form-grid">
        <lf-form-field
          :label="copy('options.ruleId')"
          type="text"
          :model-value="editingRule.id"
          placeholder="e.g. my-custom-site"
          @update:model-value="updateRuleField('id', String($event))"
        />
        <lf-form-field
          :label="copy('options.rulePriority')"
          type="number"
          :model-value="editingRule.priority"
          :min="0"
          :max="100"
          @update:model-value="updateRuleField('priority', Number($event))"
        />
        <lf-form-field
          :label="copy('options.ruleEnabled')"
          type="checkbox"
          :model-value="editingRule.enabled"
          @update:model-value="updateRuleField('enabled', $event)"
        />
      </div>

      <div class="form-divider"></div>

      <div class="form-grid">
        <label class="lf-field">
          <span class="lf-field__label">{{ copy('options.ruleUrlMatches') }}</span>
          <textarea
            class="lf-field__textarea"
            :value="(editingRule.match?.matches || []).join('\n')"
            placeholder="*://example.com/*"
            @input="updateRuleField('match.matches', ($event.target as HTMLTextAreaElement).value.split('\n').filter(Boolean))"
          />
        </label>
        <label class="lf-field">
          <span class="lf-field__label">{{ copy('options.ruleUrlExcludes') }}</span>
          <textarea
            class="lf-field__textarea"
            :value="(editingRule.match?.excludeMatches || []).join('\n')"
            placeholder="*://example.com/admin/*"
            @input="updateRuleField('match.excludeMatches', ($event.target as HTMLTextAreaElement).value.split('\n').filter(Boolean))"
          />
        </label>
      </div>

      <div class="form-grid">
        <label class="lf-field">
          <span class="lf-field__label">{{ copy('options.ruleContentRoots') }}</span>
          <textarea
            class="lf-field__textarea"
            :value="(editingRule.selectors?.contentRoots || []).join('\n')"
            placeholder="main, article, [role=main]"
            @input="updateRuleField('selectors.contentRoots', ($event.target as HTMLTextAreaElement).value.split('\n').filter(Boolean))"
          />
        </label>
        <label class="lf-field">
          <span class="lf-field__label">{{ copy('options.ruleExcludeSelectors') }}</span>
          <textarea
            class="lf-field__textarea"
            :value="(editingRule.selectors?.excludeSelectors || []).join('\n')"
            placeholder=".sidebar, .footer, nav"
            @input="updateRuleField('selectors.excludeSelectors', ($event.target as HTMLTextAreaElement).value.split('\n').filter(Boolean))"
          />
        </label>
      </div>

      <details class="json-editor-section">
        <summary>{{ copy('options.ruleJson') }}</summary>
        <textarea
          class="json-editor"
          :value="editingRuleJson"
          @input="editingRuleJson = ($event.target as HTMLTextAreaElement).value; updateRuleFromJson()"
          spellcheck="false"
        />
      </details>

      <div class="modal-actions">
        <lf-button variant="ghost" :label="copy('options.cancel')" @click="cancelRuleEditor" />
        <lf-button variant="primary" label="Save rule" @click="saveEditingRule" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  width: min(960px, calc(100vw - 40px));
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

h3 {
  margin: 0;
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
  white-space: nowrap;
}

.settings-shell {
  display: grid;
  grid-template-columns: 184px minmax(0, 1fr);
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

.settings-group {
  display: grid;
  gap: 16px;
  padding-top: 20px;
  border-top: 1px solid var(--lf-rule);
}

.settings-group--first {
  padding-top: 0;
  border-top: 0;
}

.settings-group__intro h3 {
  font-family: var(--lf-font-serif);
  font-size: 14px;
  font-weight: 400;
}

.settings-group__intro p {
  max-width: 620px;
  margin: 5px 0 0;
  color: var(--lf-whisper);
  font-size: 12px;
  line-height: 1.55;
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

.storage-actions {
  padding-top: 4px;
}

.danger-zone {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 20px;
  padding-top: 20px;
  border-top: 1px solid var(--lf-rule);
}

.danger-zone strong {
  font-family: var(--lf-font-serif);
  font-size: 14px;
  font-weight: 400;
}

.danger-zone p {
  margin: 5px 0 0;
  color: var(--lf-whisper);
  font-size: 12px;
  line-height: 1.5;
}

/* ── Responsive ── */
@media (max-width: 640px) {
  .page {
    width: min(100% - 24px, 960px);
    padding-top: 20px;
  }

  .settings-shell,
  .form-grid,
  .danger-zone {
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

/* ── Site Rules ── */
.builtin-rules-list,
.user-rules-list {
  display: grid;
  gap: 10px;
}

.builtin-rule-card,
.user-rule-card {
  padding: 14px 16px;
  border: 1px solid var(--lf-rule);
  background: var(--lf-paper);
}

.user-rule-card[data-disabled="true"] {
  opacity: 0.55;
}

.rule-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 4px;
}

.rule-card-header strong {
  font-family: var(--lf-font-sans);
  font-size: 13px;
  font-weight: 600;
}

.rule-card-badges {
  display: flex;
  gap: 6px;
}

.rule-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 600;
  background: var(--lf-margin);
  color: var(--lf-ghost);
}

.rule-badge[data-enabled="true"] {
  color: var(--lf-success);
}

.rule-badge[data-compatibility="compatible"] {
  color: var(--lf-success);
}

.rule-badge[data-compatibility="warning"] {
  color: var(--lf-accent);
}

.rule-badge[data-compatibility="incompatible"] {
  color: var(--lf-danger-confirm);
}

.rule-card-desc {
  margin: 0;
  font-size: 12px;
  color: var(--lf-whisper);
}

.rule-card-evidence {
  margin: 6px 0 0;
  overflow-wrap: anywhere;
  font-size: 11px;
  color: var(--lf-whisper);
}

.rule-card-warnings {
  margin: 6px 0 0;
  padding-left: 18px;
  font-size: 11px;
  color: var(--lf-danger-confirm);
}

.rule-card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.user-rules-actions {
  display: flex;
  gap: 8px;
}

.test-on-page {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px 18px;
}

.test-on-page p {
  margin-top: 5px;
}

.diagnostics-report {
  padding: 16px;
  border: 1px solid var(--lf-rule);
  background: var(--lf-margin);
}

.diagnostics-report h3 {
  margin: 0 0 12px;
  font-family: var(--lf-font-serif);
  font-size: 15px;
  font-weight: 400;
}

.diagnostics-grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 16px;
  margin: 0;
}

.diagnostics-grid dt {
  font-size: 12px;
  font-weight: 600;
  color: var(--lf-ghost);
}

.diagnostics-grid dd {
  margin: 0;
  font-size: 12px;
  color: var(--lf-ink);
}

.skip-reasons,
.root-diagnostics {
  margin-top: 12px;
}

.skip-reasons strong,
.root-diagnostics strong {
  font-size: 12px;
  font-weight: 600;
  color: var(--lf-ghost);
}

.skip-reasons ul,
.root-diagnostics ul {
  margin: 4px 0 0;
  padding-left: 18px;
  font-size: 12px;
  color: var(--lf-ink);
}

/* ── Rule Editor Modal ── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal-content {
  width: min(640px, calc(100vw - 40px));
  max-height: calc(100vh - 40px);
  overflow-y: auto;
  padding: 28px;
  background: var(--lf-paper);
  border: 1px solid var(--lf-rule);
}

.modal-content h3 {
  margin: 0 0 20px;
  font-family: var(--lf-font-serif);
  font-size: 16px;
  font-weight: 400;
}

.modal-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 20px;
}

.validation-errors {
  padding: 10px 14px;
  margin-bottom: 16px;
  border: 1px solid var(--lf-accent);
  background: rgba(220, 80, 60, 0.06);
}

.validation-errors p {
  margin: 0;
  font-size: 12px;
  color: var(--lf-accent);
}

.json-editor-section {
  margin-top: 16px;
}

.json-editor-section summary {
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  color: var(--lf-ghost);
}

.json-editor {
  width: 100%;
  min-height: 200px;
  margin-top: 8px;
  padding: 12px;
  border: 1px solid var(--lf-rule);
  border-radius: var(--lf-radius);
  background: var(--lf-paper);
  color: var(--lf-ink);
  font-family: monospace;
  font-size: 12px;
  resize: vertical;
  box-sizing: border-box;
}

.lf-field__textarea {
  width: 100%;
  min-height: 80px;
  padding: 8px 11px;
  border: 1px solid var(--lf-rule);
  border-radius: var(--lf-radius);
  background: var(--lf-paper);
  color: var(--lf-ink);
  font-family: var(--lf-font-sans);
  font-size: 13px;
  resize: vertical;
  box-sizing: border-box;
}

.lf-field__textarea:focus {
  outline: none;
  border-color: var(--lf-accent);
}
</style>
