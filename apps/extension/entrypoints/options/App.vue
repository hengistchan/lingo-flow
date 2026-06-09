<script setup lang="ts">
import { computed, onMounted, reactive, ref, toRaw, watch } from 'vue'
import {
  getLanguageLabel,
  getSourceLanguageOptions,
  getTargetLanguageOptions,
  resolveUiLocale,
  t,
} from '@lingoflow/shared'
import { DEFAULT_SETTINGS } from '@lingoflow/settings'
import type {
  AppSettings,
  MessageResponse,
  ProviderConnectionMessageCode,
  ProviderConnectionResult,
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
const browserLocale = resolveUiLocale(globalThis.navigator?.language)
const sourceLanguages = getSourceLanguageOptions()
const targetLanguages = getTargetLanguageOptions()

const uiLocale = computed<UiLocale>(() =>
  settings.interfaceLocale === 'auto' ? browserLocale : settings.interfaceLocale,
)
const dirty = computed(() => JSON.stringify(settings) !== JSON.stringify(savedSettings.value))
const selectedProviderConfigured = computed(() => {
  if (settings.defaultProviderId === 'azure-translator') {
    return Boolean(
      settings.providers.azure.endpoint.trim() &&
        settings.providers.azure.key.trim() &&
        settings.providers.azure.region.trim(),
    )
  }

  return Boolean(
    settings.providers.openai.baseUrl.trim() &&
      settings.providers.openai.apiKey.trim() &&
      settings.providers.openai.model.trim(),
  )
})
const connectionMessage = computed(() =>
  connectionResult.value ? copy(connectionCopyKey(connectionResult.value.messageCode)) : '',
)

watch(dirty, hasUnsavedChanges => {
  if (hasUnsavedChanges) message.value = ''
})
watch(settings, () => {
  connectionResult.value = undefined
}, { deep: true })

onMounted(loadSettings)

async function loadSettings() {
  busy.value = true
  message.value = ''

  try {
    if (hasRuntimeApi()) {
      Object.assign(settings, await sendRuntimeMessage<AppSettings>({ type: 'settings/get' }))
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
    const value = structuredClone(toRaw(settings))
    if (hasRuntimeApi()) {
      await sendRuntimeMessage({ type: 'settings/save', payload: { settings: value } })
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
      await sendRuntimeMessage({ type: 'cache/clearAll' })
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
    const config =
      providerId === 'azure-translator'
        ? structuredClone(toRaw(settings.providers.azure))
        : structuredClone(toRaw(settings.providers.openai))

    if (!hasRuntimeApi()) {
      connectionResult.value = { ok: false, providerId, messageCode: 'config_incomplete' }
      return
    }

    connectionResult.value = await sendRuntimeMessage<ProviderConnectionResult>({
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

async function sendRuntimeMessage<T = unknown>(payload: unknown): Promise<T> {
  const response = (await chrome.runtime.sendMessage(payload)) as MessageResponse<T>
  if (!response?.ok) throw new Error(response?.error?.message ?? 'Settings message failed.')
  return response.data
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
    provider_failed: 'options.connectionProviderFailed',
  }
  return keys[code]
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
                <option value="azure-translator">{{ copy('options.azure') }}</option>
                <option value="openai-compatible">{{ copy('options.openAI') }}</option>
              </select>
            </label>
            <label>
              <span>{{ copy('options.fallbackProvider') }}</span>
              <select v-model="settings.fallbackProviderId">
                <option value="">{{ copy('options.none') }}</option>
                <option value="azure-translator">{{ copy('options.azure') }}</option>
                <option value="openai-compatible">{{ copy('options.openAI') }}</option>
              </select>
            </label>
          </div>

          <div v-if="settings.defaultProviderId === 'azure-translator'" class="provider-fields">
            <label>
              <span>{{ copy('options.region') }}</span>
              <input v-model="settings.providers.azure.region" autocomplete="off" />
            </label>
            <label>
              <span>{{ copy('options.apiKey') }}</span>
              <input v-model="settings.providers.azure.key" autocomplete="off" type="password" />
            </label>
          </div>

          <div v-else class="provider-fields">
            <label>
              <span>{{ copy('options.apiKey') }}</span>
              <input v-model="settings.providers.openai.apiKey" autocomplete="off" type="password" />
            </label>
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
            <button class="danger" :disabled="busy" @click="clearAllCache">
              {{ copy('options.clearAllCache') }}
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
              <span>{{ copy('options.azureEndpoint') }}</span>
              <input v-model="settings.providers.azure.endpoint" />
            </label>
            <label>
              <span>{{ copy('options.openAIBaseUrl') }}</span>
              <input v-model="settings.providers.openai.baseUrl" />
            </label>
            <label>
              <span>{{ copy('options.model') }}</span>
              <input v-model="settings.providers.openai.model" />
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

.provider-fields {
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
</style>
