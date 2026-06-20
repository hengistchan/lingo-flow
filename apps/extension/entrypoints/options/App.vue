<script setup lang="ts">
import { computed, onMounted, reactive, ref, toRaw, watch } from 'vue'
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
import type {
  AppSettings,
  ProviderConfig,
  ProviderConnectionMessageCode,
  ProviderConnectionResult,
  ProviderPreset,
  UiLocale,
} from '@lingoflow/types'

type SettingsSection = 'languages' | 'providers' | 'storage' | 'advanced'

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

const uiLocale = computed<UiLocale>(() =>
  settings.interfaceLocale === 'auto' ? browserLocale : settings.interfaceLocale,
)
const dirty = computed(() => JSON.stringify(settings) !== JSON.stringify(savedSettings.value))

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

watch(dirty, hasUnsavedChanges => {
  if (hasUnsavedChanges) message.value = ''
})
watch(settings, () => {
  connectionResult.value = undefined
}, { deep: true })
watch(confirmClearAll, (val) => {
  if (val) setTimeout(() => { confirmClearAll.value = false }, 3000)
})

onMounted(loadSettings)

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
</script>

<template>
  <main class="page">
    <header class="masthead">
      <div>
        <h1>{{ copy('options.title') }}</h1>
        <p>{{ copy('options.subtitle') }}</p>
      </div>
      <div class="save-area">
        <span v-if="message" class="message" aria-live="polite">{{ message }}</span>
        <button :disabled="busy || !dirty" @click="save">{{ copy('options.save') }}</button>
      </div>
    </header>

    <div class="settings-shell">
      <aside class="settings-nav" aria-label="Settings sections">
        <button
          v-for="section in (['languages', 'providers', 'storage', 'advanced'] as SettingsSection[])"
          :key="section"
          class="nav-item"
          :class="{ active: activeSection === section }"
          :aria-current="activeSection === section ? 'page' : undefined"
          type="button"
          @click="activeSection = section"
        >
          {{ copy(`options.${section}`) }}
        </button>
      </aside>

      <div class="settings-content">
        <section v-if="activeSection === 'languages'">
          <h2>{{ copy('options.languages') }}</h2>
          <p class="section-intro">{{ copy('options.subtitle') }}</p>
          <div class="grid">
            <label>
              <span>{{ copy('options.targetLanguage') }}</span>
              <select v-model="settings.targetLang">
                <option v-for="language in targetLanguages" :key="language.code" :value="language.code">
                  {{ getLanguageLabel(language.code, uiLocale) }}
                </option>
              </select>
            </label>
            <label>
              <span>{{ copy('options.sourceLanguage') }}</span>
              <select v-model="settings.sourceLang">
                <option v-for="language in sourceLanguages" :key="language.code" :value="language.code">
                  {{ language.code === 'auto' ? copy('options.autoDetect') : getLanguageLabel(language.code, uiLocale) }}
                </option>
              </select>
            </label>
            <label>
              <span>{{ copy('options.interfaceLanguage') }}</span>
              <select v-model="settings.interfaceLocale">
                <option value="auto">{{ copy('options.followBrowser') }}</option>
                <option value="zh-Hans">简体中文</option>
                <option value="en">English</option>
              </select>
            </label>
          </div>
        </section>

        <section v-else-if="activeSection === 'providers'">
          <div class="section-heading">
            <div>
              <h2>{{ copy('options.providers') }}</h2>
              <p class="section-intro">
                {{ selectedProviderConfigured ? copy('options.providerConfigured') : copy('options.providerIncomplete') }}
              </p>
            </div>
            <span class="status-mark" :data-ready="selectedProviderConfigured" />
          </div>

          <div class="grid">
            <label>
              <span>{{ copy('options.defaultProvider') }}</span>
              <select v-model="settings.defaultProviderId">
                <option v-for="(config, id) in settings.providers" :key="id" :value="id">{{ config.name }}</option>
              </select>
            </label>
            <label>
              <span>{{ copy('options.fallbackProvider') }}</span>
              <select v-model="settings.fallbackProviderId">
                <option value="">{{ copy('options.none') }}</option>
                <option v-for="(config, id) in settings.providers" :key="id" :value="id">{{ config.name }}</option>
              </select>
            </label>
          </div>

          <div class="provider-fields" v-if="activeProvider">
            <template v-for="field in activeProviderFields" :key="field.key">
              <label>
                <span>{{ field.label }}</span>
                <input
                  :type="field.type"
                  :placeholder="field.placeholder"
                  v-model="activeProvider.values[field.key]"
                  autocomplete="off"
                />
              </label>
            </template>
          </div>

          <div class="provider-speed-controls" v-if="activeProvider && isOpenAICompatibleProvider">
            <label>
              <span>{{ copy('options.reasoningEffort') }}</span>
              <select v-model="activeProvider.values.reasoningEffort">
                <option v-for="effort in reasoningEffortOptions" :key="effort" :value="effort">
                  {{ copy(reasoningEffortCopyKey(effort)) }}
                </option>
              </select>
            </label>
            <label class="check">
              <input v-model="activeProvider.values.disableThinking" type="checkbox" true-value="true" false-value="false" />
              <span>{{ copy('options.disableThinking') }}</span>
            </label>
          </div>

          <div class="provider-actions">
            <button
              v-if="Object.keys(settings.providers).length > 1"
              class="danger"
              type="button"
              @click="removeProvider(settings.defaultProviderId)"
            >
              {{ copy('options.removeProvider') }}
            </button>
            <div class="add-provider-area" v-if="availablePresets.length > 0">
              <button class="secondary" type="button" @click="showAddProviderMenu = !showAddProviderMenu">
                {{ copy('options.addProvider') }}
              </button>
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
            <div class="grid">
              <label>
                <span>{{ copy('options.customProviderName') }}</span>
                <input v-model="customProviderName" type="text" placeholder="e.g. DeepL, Ollama, LM Studio" autocomplete="off" />
              </label>
              <label>
                <span>Base URL</span>
                <input v-model="customProviderBaseUrl" type="url" placeholder="http://localhost:11434/v1" autocomplete="off" />
              </label>
              <label>
                <span>API Key</span>
                <input v-model="customProviderApiKey" type="password" placeholder="Optional" autocomplete="off" />
              </label>
              <label>
                <span>Model</span>
                <input v-model="customProviderModel" type="text" placeholder="gpt-4o-mini" autocomplete="off" />
              </label>
            </div>
            <div class="custom-provider-actions">
              <button class="secondary" type="button" @click="cancelCustomProvider">{{ copy('options.cancel') }}</button>
              <button type="button" :disabled="!customProviderName.trim() || !customProviderBaseUrl.trim() || !customProviderModel.trim()" @click="confirmCustomProvider">
                {{ copy('options.addProvider') }}
              </button>
            </div>
          </div>

          <div class="connection-test">
            <div>
              <strong>{{ copy('options.testConnection') }}</strong>
              <p>{{ copy('options.connectionTestDescription') }}</p>
            </div>
            <button class="secondary" :disabled="testingConnection" @click="testConnection">
              {{ testingConnection ? copy('options.testingConnection') : copy('options.testConnection') }}
            </button>
            <p
              v-if="connectionResult"
              class="connection-result"
              :data-success="connectionResult.ok"
              aria-live="polite"
            >
              {{ connectionMessage }}
            </p>
          </div>
        </section>

        <section v-else-if="activeSection === 'storage'">
          <h2>{{ copy('options.storage') }}</h2>
          <label class="check">
            <input v-model="settings.cacheEnabled" type="checkbox" />
            <span>{{ copy('options.cacheEnabled') }}</span>
          </label>
          <div class="storage-actions">
            <button class="danger" :class="{ 'danger-confirm': confirmClearAll }" :disabled="busy" @click="confirmClearAll ? clearAllCache() : (confirmClearAll = true)">
              {{ confirmClearAll ? copy('options.confirmClearAll') : copy('options.clearAllCache') }}
            </button>
          </div>
        </section>

        <section v-else>
          <h2>{{ copy('options.advanced') }}</h2>
          <div class="grid">
            <label>
              <span>{{ copy('options.renderMode') }}</span>
              <select v-model="settings.renderMode">
                <option value="below-original">{{ copy('options.belowOriginal') }}</option>
              </select>
            </label>
            <label>
              <span>{{ copy('options.maxCacheItems') }}</span>
              <input v-model.number="settings.maxCacheItems" min="1" type="number" />
            </label>
            <label>
              <span>{{ copy('options.translationConcurrency') }}</span>
              <input v-model.number="settings.translationConcurrency" min="1" max="6" step="1" type="number" />
            </label>
          </div>
        </section>
      </div>
    </div>
  </main>
</template>

<style scoped>
:global(body) {
  margin: 0;
  background: #f5f5f5;
  color: #111827;
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.page {
  width: min(980px, calc(100vw - 40px));
  margin: 0 auto;
  padding: 36px 0 56px;
}

.masthead,
.section-heading,
.save-area {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.masthead {
  margin-bottom: 24px;
}

.save-area {
  align-items: center;
}

h1,
h2,
p {
  margin: 0;
}

h1 {
  font-size: 24px;
  line-height: 1.15;
}

h2 {
  font-size: 18px;
}

.masthead p,
.section-intro {
  margin-top: 8px;
  color: #64748b;
  font-size: 13px;
}

.settings-shell {
  display: grid;
  grid-template-columns: 190px minmax(0, 1fr);
  min-height: 520px;
  overflow: hidden;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 18px 45px rgb(15 23 42 / 7%);
}

.settings-nav {
  display: grid;
  align-content: start;
  gap: 6px;
  padding: 22px 16px;
  background: #eef4ff;
}

.nav-item {
  justify-content: flex-start;
  border-color: transparent;
  background: transparent;
  color: #64748b;
  text-align: left;
}

.nav-item.active {
  background: #dbeafe;
  color: #1d4ed8;
}

.settings-content {
  padding: 28px;
}

section {
  display: grid;
  gap: 24px;
}

.grid,
.provider-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.provider-fields,
.provider-speed-controls {
  padding-top: 22px;
  border-top: 1px solid #eef2f7;
}

label {
  display: grid;
  gap: 7px;
}

label span {
  color: #475569;
  font-size: 13px;
  font-weight: 700;
}

input,
select {
  min-height: 40px;
  box-sizing: border-box;
  width: 100%;
  border: 1px solid #dbe1ea;
  border-radius: 7px;
  padding: 0 11px;
  background: #ffffff;
  color: #111827;
  font: inherit;
  font-size: 14px;
}

.invalid {
  border-color: #dc2626;
}

.check {
  display: flex;
  align-items: center;
  gap: 9px;
}

.check input {
  width: 16px;
  min-height: 16px;
}

.storage-actions {
  padding-top: 20px;
  border-top: 1px solid #eef2f7;
}

.connection-test {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px 18px;
  padding-top: 22px;
  border-top: 1px solid #eef2f7;
}

.connection-test p {
  margin-top: 5px;
  color: #64748b;
  font-size: 13px;
}

.connection-result {
  grid-column: 1 / -1;
  margin-top: 0 !important;
  color: #b45309 !important;
  font-weight: 700;
}

.connection-result[data-success="true"] {
  color: #047857 !important;
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
  border: 1px solid #dbe1ea;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 6px 20px rgb(15 23 42 / 10%);
  overflow: hidden;
}

.menu-item {
  display: block;
  width: 100%;
  min-height: 38px;
  border: none;
  border-radius: 0;
  background: transparent;
  color: #111827;
  font-weight: 400;
  text-align: left;
  padding: 0 14px;
  cursor: pointer;
}

.menu-item:hover {
  background: #f0f6ff;
}

.menu-item:disabled {
  color: #94a3b8;
  cursor: not-allowed;
}

.menu-item:disabled:hover {
  background: transparent;
}

.custom-provider-form {
  padding: 20px;
  margin-top: 16px;
  border: 1px solid #dbe1ea;
  border-radius: 8px;
  background: #f8fafc;
}

.custom-provider-form h3 {
  margin: 0 0 16px;
  font-size: 15px;
}

.custom-provider-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 16px;
}

button {
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #2563eb;
  border-radius: 8px;
  padding: 0 14px;
  background: #2563eb;
  color: #ffffff;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.danger {
  border-color: #dc2626;
  background: #dc2626;
}

.danger-confirm {
  border-color: #991b1b;
  background: #991b1b;
}

.secondary {
  border-color: #bfdbfe;
  background: #eff6ff;
  color: #1d4ed8;
}

.message {
  color: #1d4ed8;
  font-size: 13px;
  font-weight: 700;
}

.status-mark {
  width: 9px;
  height: 9px;
  margin-top: 6px;
  border-radius: 999px;
  background: #f59e0b;
}

.status-mark[data-ready="true"] {
  background: #10b981;
}

@media (max-width: 720px) {
  .page {
    width: min(100% - 24px, 980px);
    padding-top: 20px;
  }

  .masthead,
  .save-area,
  .settings-shell,
  .grid,
  .provider-fields,
  .provider-speed-controls,
  .connection-test {
    grid-template-columns: 1fr;
  }

  .masthead,
  .save-area {
    display: grid;
  }

  .settings-nav {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .settings-content {
    padding: 22px 18px;
  }
}

@media (prefers-color-scheme: dark) {
  :global(body) {
    background: #1a1a2e;
    color: #e2e8f0;
  }

  .settings-shell {
    border-color: #334155;
    background: #16213e;
    box-shadow: 0 18px 45px rgb(0 0 0 / 30%);
  }

  .settings-nav {
    background: #1e293b;
  }

  .nav-item {
    color: #94a3b8;
  }

  .nav-item.active {
    background: #1e3a5f;
    color: #60a5fa;
  }

  .section-intro {
    color: #94a3b8;
  }

  label span {
    color: #cbd5e1;
  }

  input,
  select {
    border-color: #475569;
    background: #1e293b;
    color: #e2e8f0;
  }

  .provider-fields,
  .storage-actions,
  .connection-test {
    border-top-color: #334155;
  }

  .connection-test p {
    color: #94a3b8;
  }

  .add-provider-menu {
    border-color: #475569;
    background: #1e293b;
  }

  .menu-item {
    color: #e2e8f0;
  }

  .menu-item:hover {
    background: #1e3a5f;
  }

  .menu-item:disabled {
    color: #64748b;
  }

  .custom-provider-form {
    border-color: #475569;
    background: #1e293b;
  }

  button {
    border-color: #3b82f6;
    background: #3b82f6;
  }

  .secondary {
    border-color: #1e3a5f;
    background: #1e293b;
    color: #60a5fa;
  }

  .danger {
    border-color: #dc2626;
    background: #dc2626;
  }

  .danger-confirm {
    border-color: #991b1b;
    background: #991b1b;
  }

  .message {
    color: #60a5fa;
  }
}
</style>
