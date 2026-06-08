<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { DEFAULT_SETTINGS } from '@lingoflow/settings'
import type { AppSettings, MessageResponse, ProviderId } from '@lingoflow/types'

const settings = reactive<AppSettings>(structuredClone(DEFAULT_SETTINGS))
const cacheDomain = ref('')
const message = ref('')
const busy = ref(false)

onMounted(loadSettings)

async function loadSettings() {
  busy.value = true
  message.value = ''

  try {
    Object.assign(settings, await sendRuntimeMessage<AppSettings>({ type: 'settings/get' }))
  } catch (error) {
    message.value = error instanceof Error ? error.message : String(error)
  } finally {
    busy.value = false
  }
}

async function save() {
  busy.value = true
  message.value = ''

  try {
    await sendRuntimeMessage({ type: 'settings/save', payload: { settings: structuredClone(settings) } })
    message.value = 'Settings saved.'
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
    await sendRuntimeMessage({ type: 'cache/clearAll' })
    message.value = 'All translation cache cleared.'
  } catch (error) {
    message.value = error instanceof Error ? error.message : String(error)
  } finally {
    busy.value = false
  }
}

async function clearDomainCache() {
  if (!cacheDomain.value.trim()) {
    message.value = 'Enter a domain first.'
    return
  }

  busy.value = true
  message.value = ''

  try {
    await sendRuntimeMessage({
      type: 'cache/clearByDomain',
      payload: { domain: cacheDomain.value.trim() },
    })
    message.value = `Cache cleared for ${cacheDomain.value.trim()}.`
  } catch (error) {
    message.value = error instanceof Error ? error.message : String(error)
  } finally {
    busy.value = false
  }
}

async function sendRuntimeMessage<T = unknown>(payload: unknown): Promise<T> {
  const response = (await chrome.runtime.sendMessage(payload)) as MessageResponse<T>
  if (!response?.ok) {
    throw new Error(response?.error?.message ?? 'Settings message failed.')
  }
  return response.data
}
</script>

<template>
  <main class="page">
    <header class="masthead">
      <div>
        <h1>LingoFlow Settings</h1>
        <p>Local provider keys, rendering, and cache controls.</p>
      </div>
      <button :disabled="busy" @click="save">Save Settings</button>
    </header>

    <p v-if="message" class="message">{{ message }}</p>

    <div class="settings-shell">
      <aside class="settings-nav" aria-label="Settings sections">
        <button class="nav-item active" type="button">General</button>
        <button class="nav-item" type="button">Providers</button>
        <button class="nav-item" type="button">Cache</button>
      </aside>

      <div class="settings-content">
        <section>
          <h2>General Settings</h2>
          <div class="grid">
            <label>
              <span>Target language</span>
              <input v-model="settings.targetLang" placeholder="zh-Hans" />
            </label>
            <label>
              <span>Source language</span>
              <input v-model="settings.sourceLang" placeholder="en" />
            </label>
            <label>
              <span>Render mode</span>
              <select v-model="settings.renderMode">
                <option value="below-original">Below original text</option>
              </select>
            </label>
            <label>
              <span>Max cache items</span>
              <input v-model.number="settings.maxCacheItems" min="1" type="number" />
            </label>
          </div>
          <label class="check">
            <input v-model="settings.cacheEnabled" type="checkbox" />
            <span>Enable IndexedDB local cache</span>
          </label>
        </section>

        <section>
          <h2>Translation Providers</h2>
          <div class="provider-list">
            <label class="provider-row">
              <span>Azure Translator</span>
              <select v-model="settings.defaultProviderId">
                <option value="azure-translator">Default</option>
                <option value="openai-compatible">OpenAI default</option>
              </select>
            </label>
            <label class="provider-row">
              <span>Fallback provider</span>
              <select v-model="settings.fallbackProviderId">
                <option value="">None</option>
                <option value="azure-translator">Azure Translator</option>
                <option value="openai-compatible">OpenAI-compatible</option>
              </select>
            </label>
          </div>
        </section>

        <section>
          <h2>Azure Translator</h2>
          <div class="grid">
            <label>
              <span>Endpoint</span>
              <input v-model="settings.providers.azure.endpoint" />
            </label>
            <label>
              <span>Region</span>
              <input v-model="settings.providers.azure.region" />
            </label>
            <label>
              <span>API key</span>
              <input v-model="settings.providers.azure.key" autocomplete="off" type="password" />
            </label>
          </div>
        </section>

        <section>
          <h2>OpenAI-compatible</h2>
          <div class="grid">
            <label>
              <span>Base URL</span>
              <input v-model="settings.providers.openai.baseUrl" />
            </label>
            <label>
              <span>Model</span>
              <input v-model="settings.providers.openai.model" />
            </label>
            <label>
              <span>API key</span>
              <input v-model="settings.providers.openai.apiKey" autocomplete="off" type="password" />
            </label>
          </div>
        </section>

        <section>
          <h2>Cache Controls</h2>
          <div class="cache-row">
            <input v-model="cacheDomain" placeholder="example.com" />
            <button :disabled="busy" @click="clearDomainCache">Clear Site Cache</button>
            <button class="danger" :disabled="busy" @click="clearAllCache">Clear All Cache</button>
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

.masthead {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 24px;
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
  margin-bottom: 16px;
  font-size: 17px;
}

p {
  margin-top: 8px;
  color: #6b7280;
}

.settings-shell {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
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
  min-height: 34px;
  border: 0;
  background: transparent;
  color: #6b7280;
  text-align: left;
}

.nav-item.active {
  background: #dbeafe;
  color: #1d4ed8;
}

.settings-content {
  padding: 10px 22px 24px;
}

section {
  margin-top: 14px;
  padding: 18px 0 0;
  border: 0;
  border-top: 1px solid #eef2f7;
  border-radius: 0;
  background: #ffffff;
}

section:first-child {
  border-top: 0;
}

.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

label {
  display: grid;
  gap: 7px;
}

label span {
  color: #4b5563;
  font-size: 13px;
  font-weight: 700;
}

input,
select {
  min-height: 38px;
  box-sizing: border-box;
  width: 100%;
  border: 1px solid #e5e7eb;
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
  margin-top: 16px;
}

.check input {
  width: 16px;
  min-height: 16px;
}

.cache-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 10px;
}

button {
  min-height: 38px;
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
  opacity: 0.6;
}

.danger {
  border-color: #dc2626;
  background: #dc2626;
}

.message {
  padding: 12px 14px;
  border: 1px solid #dbeafe;
  border-radius: 8px;
  background: #eff6ff;
  color: #1d4ed8;
}

.provider-list {
  display: grid;
  gap: 10px;
}

.provider-row {
  grid-template-columns: minmax(0, 1fr) 180px;
  align-items: center;
  min-height: 46px;
  padding: 0 12px;
  border: 1px solid #eef2f7;
  border-radius: 8px;
  background: #ffffff;
}

@media (max-width: 720px) {
  .masthead,
  .cache-row,
  .settings-shell,
  .provider-row {
    grid-template-columns: 1fr;
  }

  .masthead {
    display: grid;
  }

  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
