<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, toRaw, watch } from 'vue'
import LfButton from '../../src/ui/LfButton.vue'
import LfFormField from '../../src/ui/LfFormField.vue'
import LfNavItem from '../../src/ui/LfNavItem.vue'
import {
  getLanguageLabel,
  getSourceLanguageOptions,
  getTargetLanguageOptions,
  resolveUiLocale,
  t,
  sendChromeMessage,
} from '@lingoflow/shared'
import { DEFAULT_SETTINGS } from '@lingoflow/settings'
import { BUILT_IN_PRESETS, GOOGLE_FREE_TRANSLATE_ENDPOINT, isProviderConfigured } from '@lingoflow/providers'
import { SITE_RULES } from '@lingoflow/rules'
import type {
  AppSettings,
  PageDiagnostics,
  ProviderConfig,
  ProviderConnectionMessageCode,
  ProviderConnectionResult,
  ProviderPreset,
  RootDiagnostic,
  UiLocale,
  UserSiteRule,
} from '@lingoflow/types'

type SettingsSection = 'languages' | 'providers' | 'storage' | 'advanced' | 'siteRules'

const settings = reactive<AppSettings>(structuredClone(DEFAULT_SETTINGS))
const savedSettings = ref<AppSettings>(structuredClone(DEFAULT_SETTINGS))
const activeSection = ref<SettingsSection>('languages')
const message = ref('')
const busy = ref(false)
const testingConnection = ref(false)
const connectionResult = ref<ProviderConnectionResult>()
const confirmClearAll = ref(false)
const showAddProviderMenu = ref(false)
const showCustomProviderForm = ref(false)
const customProviderName = ref('')
const customProviderBaseUrl = ref('')
const customProviderApiKey = ref('')
const customProviderModel = ref('')
const browserLocale = resolveUiLocale(globalThis.navigator?.language)
const sourceLanguages = getSourceLanguageOptions()
const targetLanguages = getTargetLanguageOptions()
const reasoningEffortOptions = ['auto', 'none', 'minimal', 'low', 'medium', 'high'] as const

const userRules = ref<UserSiteRule[]>([])
const editingRule = ref<UserSiteRule | null>(null)
const editingRuleJson = ref('')
const editingRuleErrors = ref<string[]>([])
const showRuleEditor = ref(false)
const diagnosticsResult = ref<PageDiagnostics | null>(null)
const testingPage = ref(false)

const uiLocale = computed<UiLocale>(() =>
  settings.interfaceLocale === 'auto' ? browserLocale : settings.interfaceLocale,
)
const dirty = computed(() => JSON.stringify(settings) !== JSON.stringify(savedSettings.value))
const builtinRules = computed(() => SITE_RULES)

const activeProvider = computed({
  get: () => settings.providers[settings.defaultProviderId],
  set: (val) => { if (val) settings.providers[settings.defaultProviderId] = val },
})

const activeProviderPreset = computed(() =>
  BUILT_IN_PRESETS.find(p => p.id === activeProvider.value?.presetId),
)

const activeProviderFields = computed(() => activeProviderPreset.value?.fields ?? [])
const isOpenAICompatibleProvider = computed(() => activeProvider.value?.presetId === 'openai-compatible')

const selectedProviderConfigured = computed(() => {
  const config = settings.providers[settings.defaultProviderId]
  return config ? isProviderConfigured(config) : false
})

const connectionMessage = computed(() =>
  connectionResult.value ? copy(connectionCopyKey(connectionResult.value.messageCode)) : '',
)

const availablePresets = computed(() =>
  BUILT_IN_PRESETS.filter(p => !(p.id in settings.providers)),
)

function formatRootDiagnostic(root: RootDiagnostic): string {
  const score = typeof root.score === 'number' ? ` · score ${root.score}` : ''
  const source = root.sourceSelector ? ` · ${root.sourceSelector}` : ''
  return `${root.selector}${score}${source}`
}

function formatRejectedRoot(root: RootDiagnostic): string {
  const reason = root.rejectReason ? ` · ${root.rejectReason}` : ''
  return `${formatRootDiagnostic(root)}${reason}`
}

watch(dirty, hasUnsavedChanges => {
  if (hasUnsavedChanges) message.value = ''
})
watch(settings, () => {
  connectionResult.value = undefined
}, { deep: true })
watch(confirmClearAll, (val) => {
  if (val) setTimeout(() => { confirmClearAll.value = false }, 3000)
})

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

async function testConnection() {
  testingConnection.value = true
  connectionResult.value = undefined

  try {
    const providerId = settings.defaultProviderId
    const config = structuredClone(toRaw(settings.providers[providerId]))

    if (!hasRuntimeApi()) {
      connectionResult.value = { ok: false, providerId, messageCode: 'config_incomplete' }
      return
    }

    const endpoint = getProviderEndpoint(config)
    if (!(await requestProviderOriginAccess(endpoint))) {
      connectionResult.value = { ok: false, providerId, messageCode: 'permission_denied' }
      return
    }

    connectionResult.value = await sendChromeMessage<ProviderConnectionResult>({
      type: 'provider/testConnection',
      payload: { providerId, config },
    })
  } catch {
    connectionResult.value = {
      ok: false,
      providerId: settings.defaultProviderId,
      messageCode: 'provider_failed',
    }
  } finally {
    testingConnection.value = false
  }
}

function addProvider(presetId: string) {
  const preset = BUILT_IN_PRESETS.find(p => p.id === presetId)
  if (!preset) return
  const defaultValues: Record<string, string> = {}
  for (const field of preset.fields) {
    if (field.defaultValue) defaultValues[field.key] = field.defaultValue
  }
  if (presetId === 'openai-compatible') {
    defaultValues.reasoningEffort = 'auto'
    defaultValues.disableThinking = 'false'
  }
  settings.providers[presetId] = {
    id: presetId,
    presetId: presetId,
    name: preset.name,
    values: defaultValues,
  }
  settings.defaultProviderId = presetId
  showAddProviderMenu.value = false
}

function removeProvider(id: string) {
  if (Object.keys(settings.providers).length <= 1) return
  delete settings.providers[id]
  if (settings.defaultProviderId === id) {
    settings.defaultProviderId = Object.keys(settings.providers)[0] ?? ''
  }
  if (settings.fallbackProviderId === id) {
    settings.fallbackProviderId = ''
  }
}

function openCustomProviderForm() {
  showAddProviderMenu.value = false
  showCustomProviderForm.value = true
  customProviderName.value = ''
  customProviderBaseUrl.value = 'http://localhost:11434/v1'
  customProviderApiKey.value = ''
  customProviderModel.value = 'gpt-4o-mini'
}

function cancelCustomProvider() {
  showCustomProviderForm.value = false
}

function confirmCustomProvider() {
  const name = customProviderName.value.trim()
  const baseUrl = customProviderBaseUrl.value.trim()
  const apiKey = customProviderApiKey.value.trim()
  const model = customProviderModel.value.trim()
  if (!name || !baseUrl || !model) return

  const id = 'custom-' + Date.now()
  settings.providers[id] = {
    id,
    presetId: 'openai-compatible',
    name,
    values: { baseUrl, apiKey, model, reasoningEffort: 'auto', disableThinking: 'false' },
  }
  settings.defaultProviderId = id
  showCustomProviderForm.value = false
}

function getProviderEndpoint(config: ProviderConfig): string {
  if (config.presetId === 'google-free-translate') return GOOGLE_FREE_TRANSLATE_ENDPOINT
  return config.values.endpoint || config.values.baseUrl || ''
}

function getProviderConfig(value: AppSettings): ProviderConfig {
  return value.providers[value.defaultProviderId]
}

function copy(key: Parameters<typeof t>[1], variables?: Record<string, string | number>) {
  return t(uiLocale.value, key, variables)
}

function connectionCopyKey(code: ProviderConnectionMessageCode): Parameters<typeof t>[1] {
  const keys: Record<ProviderConnectionMessageCode, Parameters<typeof t>[1]> = {
    connection_ok: 'options.connectionOk',
    config_incomplete: 'options.connectionConfigIncomplete',
    authentication_failed: 'options.connectionAuthenticationFailed',
    network_failed: 'options.connectionNetworkFailed',
    permission_denied: 'options.connectionPermissionDenied',
    provider_failed: 'options.connectionProviderFailed',
  }
  return keys[code]
}

function reasoningEffortCopyKey(effort: typeof reasoningEffortOptions[number]): Parameters<typeof t>[1] {
  const keys: Record<typeof reasoningEffortOptions[number], Parameters<typeof t>[1]> = {
    auto: 'options.reasoningAuto',
    none: 'options.reasoningNone',
    minimal: 'options.reasoningMinimal',
    low: 'options.reasoningLow',
    medium: 'options.reasoningMedium',
    high: 'options.reasoningHigh',
  }
  return keys[effort]
}

async function requestProviderOriginAccess(endpoint: string) {
  const origin = providerOriginPattern(endpoint)

  if (!origin || !hasRuntimeApi() || typeof globalThis.chrome?.permissions?.request !== 'function') {
    return Boolean(origin)
  }

  if (typeof globalThis.chrome.permissions.contains === 'function') {
    const alreadyAllowed = await chrome.permissions.contains({ origins: [origin] })
    if (alreadyAllowed) return true
  }

  return chrome.permissions.request({ origins: [origin] })
}

function providerOriginPattern(endpoint: string) {
  try {
    const url = new URL(endpoint)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined
    return `${url.origin}/*`
  } catch {
    return undefined
  }
}

function hasRuntimeApi() {
  return typeof globalThis.chrome?.runtime?.sendMessage === 'function'
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
  editingRuleErrors.value = []
  showRuleEditor.value = true
}

function editUserRule(rule: UserSiteRule) {
  editingRule.value = structuredClone(rule)
  editingRuleJson.value = JSON.stringify(rule, null, 2)
  editingRuleErrors.value = []
  showRuleEditor.value = true
}

function duplicateUserRule(rule: UserSiteRule) {
  const now = new Date().toISOString()
  editingRule.value = {
    ...structuredClone(rule),
    id: `${rule.id}-copy`,
    createdAt: now,
    updatedAt: now,
  }
  editingRuleJson.value = JSON.stringify(editingRule.value, null, 2)
  editingRuleErrors.value = []
  showRuleEditor.value = true
}

async function deleteUserRule(ruleId: string) {
  userRules.value = userRules.value.filter(r => r.id !== ruleId)
  await saveUserRulesToStorage()
  message.value = copy('options.ruleDeleted')
}

async function toggleUserRule(ruleId: string) {
  const rule = userRules.value.find(r => r.id === ruleId)
  if (rule) {
    rule.enabled = !rule.enabled
    rule.updatedAt = new Date().toISOString()
    await saveUserRulesToStorage()
  }
}

function cancelRuleEditor() {
  showRuleEditor.value = false
  editingRule.value = null
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

  const validation = await validateRule(editingRule.value)
  if (!validation.valid) {
    editingRuleErrors.value = validation.errors.map(e => e.message)
    return
  }

  const now = new Date().toISOString()
  const rule = { ...editingRule.value, updatedAt: now }
  const idx = userRules.value.findIndex(r => r.id === rule.id)
  if (idx >= 0) {
    userRules.value[idx] = rule
  } else {
    userRules.value.push(rule)
  }

  await saveUserRulesToStorage()
  showRuleEditor.value = false
  editingRule.value = null
  message.value = copy('options.ruleSaved')
}

async function validateRule(rule: UserSiteRule): Promise<{ valid: boolean; errors: { field: string; message: string }[] }> {
  if (!hasRuntimeApi()) {
    return { valid: !!(rule.id && rule.id.trim()), errors: rule.id?.trim() ? [] : [{ field: 'id', message: 'Rule ID is required' }] }
  }
  try {
    const result = await sendChromeMessage<{ ok: true } | { ok: false; errors: { field: string; message: string }[] }>({
      type: 'userRules/validate',
      payload: { rule },
    })
    return result.ok
      ? { valid: true, errors: [] }
      : { valid: false, errors: result.errors }
  } catch {
    return { valid: false, errors: [{ field: 'id', message: 'Validation failed' }] }
  }
}

async function saveUserRulesToStorage() {
  if (!hasRuntimeApi()) return
  try {
    await sendChromeMessage({ type: 'userRules/save', payload: { rules: userRules.value } })
  } catch {
    // ignore
  }
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
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) {
      message.value = copy('options.noActiveTab')
      return
    }
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['lingoflow-content.js'],
      })
    } catch {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content-scripts/content.js'],
      })
    }
    const result = await chrome.tabs.sendMessage(tab.id, {
      type: 'page/diagnose',
    })
    if (result?.ok) {
      diagnosticsResult.value = result.data
    } else {
      message.value = result?.error?.message ?? 'Diagnostics failed'
    }
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
      <aside class="settings-nav" aria-label="Settings sections">
        <lf-nav-item
          v-for="section in (['languages', 'providers', 'storage', 'advanced', 'siteRules'] as SettingsSection[])"
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
            <lf-form-field
              :label="copy('options.defaultProvider')"
              type="select"
              :model-value="settings.defaultProviderId"
              :options="Object.entries(settings.providers).map(([id, c]) => ({ value: id, label: c.name }))"
              @update:model-value="settings.defaultProviderId = String($event)"
            />
            <lf-form-field
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
              <lf-form-field
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
            <lf-form-field
              :label="copy('options.reasoningEffort')"
              type="select"
              :model-value="activeProvider.values.reasoningEffort ?? 'auto'"
              :options="reasoningEffortOptions.map(e => ({ value: e, label: copy(reasoningEffortCopyKey(e)) }))"
              @update:model-value="activeProvider.values.reasoningEffort = String($event)"
            />
            <lf-form-field
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
              <lf-form-field
                :label="copy('options.customProviderName')"
                v-model="customProviderName"
                placeholder="e.g. DeepL, Ollama, LM Studio"
              />
              <lf-form-field
                label="Base URL"
                type="url"
                v-model="customProviderBaseUrl"
                placeholder="http://localhost:11434/v1"
              />
              <lf-form-field
                label="API Key"
                type="password"
                v-model="customProviderApiKey"
                placeholder="Optional"
              />
              <lf-form-field
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
          <lf-form-field
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
        <section v-else-if="activeSection === 'advanced'">
          <h2>{{ copy('options.advanced') }}</h2>
          <div class="form-grid">
            <lf-form-field
              :label="copy('options.renderMode')"
              type="select"
              :model-value="settings.renderMode"
              :options="[{ value: 'below-original', label: copy('options.belowOriginal') }]"
              @update:model-value="settings.renderMode = String($event) as any"
            />
            <lf-form-field
              :label="copy('options.maxCacheItems')"
              type="number"
              :model-value="settings.maxCacheItems"
              :min="1"
              @update:model-value="settings.maxCacheItems = Number($event)"
            />
            <lf-form-field
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

        <!-- Site Rules Section -->
        <section v-else-if="activeSection === 'siteRules'">
          <div class="section-heading">
            <h2>{{ copy('options.siteRules') }}</h2>
          </div>

          <h3>{{ copy('options.builtInRules') }}</h3>
          <div class="builtin-rules-list">
            <div v-for="rule in builtinRules" :key="rule.id" class="builtin-rule-card">
              <div class="rule-card-header">
                <strong>{{ rule.id }}</strong>
                <span class="rule-badge">built-in</span>
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
                </div>
              </div>
              <p class="rule-card-desc" v-if="rule.match?.matches">
                {{ rule.match.matches.join(', ') }}
              </p>
              <div class="rule-card-actions">
                <lf-button variant="ghost" :label="rule.enabled ? 'Disable' : 'Enable'" @click="toggleUserRule(rule.id)" />
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
              <p class="section-intro">Run a dry-run diagnostics scan on the active tab without calling any translation provider.</p>
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
    <div class="modal-content">
      <h3>{{ editingRule.id ? copy('options.editUserRule') : copy('options.createUserRule') }}</h3>

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
  color: var(--lf-success);
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
  color: var(--lf-success);
}

.storage-actions {
  padding-top: 4px;
}

/* ── Responsive ── */
@media (max-width: 640px) {
  .page {
    width: min(100% - 24px, 960px);
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

.rule-card-desc {
  margin: 0;
  font-size: 12px;
  color: var(--lf-whisper);
}

.rule-card-actions {
  display: flex;
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
