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
        <section v-else>
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
      </div>
    </div>
  </main>
</template>

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
