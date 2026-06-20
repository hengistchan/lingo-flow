<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  getLanguageLabel,
  getTargetLanguageOptions,
  resolveUiLocale,
  t,
  sendChromeMessage,
} from '@lingoflow/shared'
import type {
  MessageResponse,
  PageTranslationProgress,
  SettingsSummary,
  UiLocale,
} from '@lingoflow/types'

const extensionApiAvailable = ref(hasExtensionPageApi())
const uiLocale = ref<UiLocale>(resolveUiLocale(globalThis.navigator?.language))
const summary = ref<SettingsSummary>({
  sourceLang: 'auto',
  targetLang: 'zh-Hans',
  interfaceLocale: 'auto',
  providerId: 'azure-translator',
  providerName: 'Azure Translator',
  providerConfigured: !extensionApiAvailable.value,
})
const progress = ref<PageTranslationProgress>(idleProgress())
const pendingTargetLang = ref(summary.value.targetLang)
const targetSelectionTouched = ref(false)
const busy = ref(false)
const actionFailed = ref(false)
const contentInjected = ref(false)
const cacheMessage = ref('')
let pollTimer: number | undefined
const targetLanguages = getTargetLanguageOptions()

const targetLanguageName = computed(() => getLanguageLabel(pendingTargetLang.value, uiLocale.value))
const hasTranslations = computed(() => progress.value.translatedBlocks > 0)
const statusLabel = computed(() => {
  if (!summary.value.providerConfigured) return copy('popup.providerNotConfigured')
  if (progress.value.status === 'translating') return copy('popup.translating')
  if (progress.value.status === 'done') return copy('popup.complete')
  if (progress.value.status === 'partial') return copy('popup.partial')
  if (progress.value.status === 'failed') return copy('popup.failed')
  return copy('popup.ready')
})
const primaryActionLabel = computed(() => {
  if (busy.value || progress.value.status === 'translating') {
    return copy('popup.translatingTo', { language: targetLanguageName.value })
  }
  if (hasTranslations.value) {
    return copy('popup.translateAgain', { language: targetLanguageName.value })
  }
  return copy('popup.translateTo', { language: targetLanguageName.value })
})
const loading = computed(() => busy.value && progress.value.status === "idle")
const completion = computed(() => {
  if (progress.value.totalBlocks === 0) return 0
  return Math.round(((progress.value.translatedBlocks + progress.value.failedBlocks) / progress.value.totalBlocks) * 100)
})
const userMessage = computed(() => {
  if (progress.value.messageCode === 'no_readable_text') return copy('popup.noReadableText')
  if (progress.value.status === 'failed' || actionFailed.value) return copy('popup.genericFailure')
  return ''
})

function onProgressUpdate(message: { type?: string; payload?: PageTranslationProgress }) {
  if (message?.type === 'page/progressUpdate' && message.payload) {
    progress.value = { ...message.payload }
    if (!targetSelectionTouched.value && message.payload.status !== 'idle') {
      pendingTargetLang.value = message.payload.targetLang
    }
  }
}

onMounted(() => {
  if (!extensionApiAvailable.value) return

  chrome.runtime.onMessage.addListener(onProgressUpdate)
  void initialize()
  pollTimer = window.setInterval(refreshStatus, 3000)
})

onUnmounted(() => {
  chrome.runtime.onMessage.removeListener(onProgressUpdate)
  if (pollTimer) window.clearInterval(pollTimer)
})

async function initialize() {
  try {
    summary.value = await sendChromeMessage<SettingsSummary>({ type: 'settings/getSummary' })
    if (summary.value.interfaceLocale !== 'auto') {
      uiLocale.value = summary.value.interfaceLocale
    }
    pendingTargetLang.value = summary.value.targetLang
    targetSelectionTouched.value = false
    contentInjected.value = false
    await refreshStatus()
  } catch {
    actionFailed.value = true
  }
}

async function translatePage() {
  if (!summary.value.providerConfigured) {
    await openSettings()
    return
  }
  if (!extensionApiAvailable.value) return

  busy.value = true
  actionFailed.value = false

  try {
    const tab = await getActiveTab()
    await ensureContentRuntime(tab.id)
    progress.value = await sendTabMessage<PageTranslationProgress>(tab.id, {
      type: 'page/translate',
      payload: { targetLang: pendingTargetLang.value },
    })
    contentInjected.value = true
  } catch {
    actionFailed.value = true
    progress.value.status = 'failed'
  } finally {
    busy.value = false
  }
}

async function clearTranslation() {
  if (!extensionApiAvailable.value) return

  busy.value = true
  actionFailed.value = false

  try {
    const tab = await getActiveTab()
    await ensureContentRuntime(tab.id)
    progress.value = await sendTabMessage<PageTranslationProgress>(tab.id, { type: 'page/clear' })
  } catch {
    actionFailed.value = true
  } finally {
    busy.value = false
  }
}

async function clearSiteCache() {
  if (!extensionApiAvailable.value) return

  busy.value = true
  cacheMessage.value = ''

  try {
    const tab = await getActiveTab()
    const domain = tab.url ? new URL(tab.url).hostname : ''
    if (!domain) throw new Error('No current website is available.')
    await sendChromeMessage({ type: 'cache/clearByDomain', payload: { domain } })
    await ensureContentRuntime(tab.id)
    await sendTabMessage(tab.id, { type: 'page/clearCache' })
    cacheMessage.value = copy('popup.siteCacheCleared')
  } catch {
    cacheMessage.value = copy('popup.siteCacheFailed')
  } finally {
    busy.value = false
  }
}

async function refreshStatus() {
  try {
    const tab = await getActiveTab()
    if (!contentInjected.value) {
      await ensureContentRuntime(tab.id)
      contentInjected.value = true
    }
    const nextProgress = await sendTabMessage<PageTranslationProgress>(tab.id, { type: 'page/status' })
    progress.value = nextProgress
    if (!targetSelectionTouched.value && nextProgress.status !== 'idle') {
      pendingTargetLang.value = nextProgress.targetLang
    }
  } catch {
    contentInjected.value = false
    progress.value = idleProgress()
  }
}

async function openSettings() {
  const openOptionsPage = getPreviewSafeChrome().runtime?.openOptionsPage

  if (typeof openOptionsPage === 'function') {
    await openOptionsPage()
    return
  }

  window.location.href = 'options.html'
}

async function getActiveTab(): Promise<chrome.tabs.Tab & { id: number }> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) throw new Error('No active tab is available.')
  return tab as chrome.tabs.Tab & { id: number }
}

async function ensureContentRuntime(tabId: number) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['lingoflow-content.js'],
    })
    await ensureInspectorBridge(tabId)
  } catch (firstError) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content-scripts/content.js'],
      })
      await ensureInspectorBridge(tabId)
    } catch {
      throw firstError
    }
  }
}

async function ensureInspectorBridge(tabId: number) {
  const {
    installDevInspectorPageBridge,
    LINGOFLOW_INSPECT_REQUEST,
    LINGOFLOW_INSPECT_RESPONSE,
  } = await import('../../src/dev-inspector')

  await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: installDevInspectorPageBridge,
    args: [LINGOFLOW_INSPECT_REQUEST, LINGOFLOW_INSPECT_RESPONSE],
  })
}

async function sendTabMessage<T>(tabId: number, message: unknown): Promise<T> {
  const response = (await chrome.tabs.sendMessage(tabId, message)) as MessageResponse<T>
  if (!response?.ok) throw new Error(response?.error?.message ?? 'Page message failed.')
  return response.data
}

function copy(key: Parameters<typeof t>[1], variables?: Record<string, string | number>) {
  return t(uiLocale.value, key, variables)
}

function idleProgress(): PageTranslationProgress {
  return {
    status: 'idle',
    sourceLang: 'auto',
    targetLang: summary.value?.targetLang ?? 'zh-Hans',
    totalBlocks: 0,
    translatedBlocks: 0,
    cacheHits: 0,
    failedBlocks: 0,
  }
}

function hasExtensionPageApi() {
  const chromeApi = getPreviewSafeChrome()

  return Boolean(
    typeof chromeApi.runtime?.sendMessage === 'function' &&
      typeof chromeApi.tabs?.query === 'function' &&
      typeof chromeApi.tabs.sendMessage === 'function' &&
      typeof chromeApi.scripting?.executeScript === 'function',
  )
}

function getPreviewSafeChrome() {
  return (globalThis as {
    chrome?: {
      runtime?: {
        openOptionsPage?: () => Promise<void> | void
        sendMessage?: unknown
      }
      scripting?: {
        executeScript?: unknown
      }
      tabs?: {
        query?: unknown
        sendMessage?: unknown
      }
    }
  }).chrome ?? {}
}
</script>

<template>
  <main class="popup">
    <header class="header">
      <span class="brand-mark">LF</span>
      <div class="brand-copy">
        <h1>LingoFlow</h1>
        <p aria-live="polite">{{ statusLabel }}</p>
      </div>
      <button class="icon-button" :aria-label="copy('popup.settings')" :title="copy('popup.settings')" @click="openSettings">
        <span aria-hidden="true">⚙</span>
      </button>
    </header>

    <section v-if="loading" class="loading-indicator">
      <p>{{ copy("popup.loading") }}</p>
    </section>

    <section class="language-flow" aria-label="Translation language">
      <p class="source-language">{{ copy('popup.autoDetect') }}</p>
      <span class="direction" aria-hidden="true">↓</span>
      <label class="target-language">
        <span>{{ copy('popup.targetLanguage') }}</span>
        <select
          v-model="pendingTargetLang"
          :disabled="busy || progress.status === 'translating'"
          @change="targetSelectionTouched = true"
        >
          <option v-for="language in targetLanguages" :key="language.code" :value="language.code">
            {{ getLanguageLabel(language.code, uiLocale) }}
          </option>
        </select>
      </label>
    </section>

    <section v-if="progress.status === 'translating'" class="progress-panel">
      <div class="progress-heading">
        <strong>{{ primaryActionLabel }}</strong>
        <span>{{ completion }}%</span>
      </div>
      <div class="progress-track" aria-hidden="true">
        <div class="progress-fill" :style="{ width: `${completion}%` }" />
      </div>
      <dl class="stats">
        <div>
          <dt>{{ copy('popup.progress') }}</dt>
          <dd>{{ progress.translatedBlocks + progress.failedBlocks }}/{{ progress.totalBlocks }}</dd>
        </div>
        <div>
          <dt>{{ copy('popup.failedBlocks') }}</dt>
          <dd>{{ progress.failedBlocks }}</dd>
        </div>
      </dl>
    </section>

    <section v-else-if="summary.providerConfigured && progress.status !== 'idle'" class="result-summary">
      <strong>{{ statusLabel }}</strong>
      <span>{{ progress.translatedBlocks }}/{{ progress.totalBlocks }}</span>
    </section>

    <p v-if="userMessage" class="message" aria-live="polite">{{ userMessage }}</p>
    <p v-if="cacheMessage" class="message" aria-live="polite">{{ cacheMessage }}</p>

    <div class="actions">
      <button v-if="summary.providerConfigured" class="primary" :disabled="busy || progress.status === 'translating'" @click="translatePage">
        {{ primaryActionLabel }}
      </button>
      <button v-else class="primary" @click="openSettings">
        {{ copy('popup.configureProvider') }}
      </button>
      <button v-if="hasTranslations" :disabled="busy" @click="clearTranslation">
        {{ copy('popup.clearTranslation') }}
      </button>
      <button :disabled="busy" @click="clearSiteCache">
        {{ copy('popup.clearSiteCache') }}
      </button>
    </div>
  </main>
</template>

<style scoped>
:global(body) {
  margin: 0;
  min-width: 320px;
  background: #f5f5f5;
  color: #111827;
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.popup {
  width: 320px;
  box-sizing: border-box;
  padding: 18px;
  background: #ffffff;
}

.header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.brand-copy {
  min-width: 0;
}

h1,
p {
  margin: 0;
}

h1 {
  font-size: 14px;
  line-height: 1.2;
  font-weight: 800;
}

.brand-copy p {
  margin-top: 3px;
  color: #64748b;
  font-size: 12px;
}

.brand-mark {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 6px;
  background: #2563eb;
  color: #ffffff;
  font-size: 10px;
  font-weight: 800;
}

.icon-button {
  width: 34px;
  min-height: 34px;
  margin-left: auto;
  padding: 0;
  border-color: transparent;
  background: transparent;
  color: #64748b;
  font-size: 17px;
}

.language-flow {
  display: grid;
  justify-items: center;
  gap: 7px;
  margin-top: 18px;
  padding: 15px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.source-language {
  color: #475569;
  font-size: 13px;
  font-weight: 700;
}

.direction {
  color: #94a3b8;
  font-size: 15px;
}

.target-language {
  display: grid;
  width: 100%;
  gap: 6px;
}

.target-language span {
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}

select {
  min-height: 40px;
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #cbd5e1;
  border-radius: 7px;
  padding: 0 10px;
  background: #ffffff;
  color: #111827;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
}

.progress-panel,
.result-summary {
  margin-top: 12px;
  padding: 12px;
  border-radius: 8px;
  background: #f8fafc;
}

.progress-heading,
.result-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 12px;
}

.progress-track {
  height: 5px;
  margin: 10px 0;
  overflow: hidden;
  border-radius: 999px;
  background: #dbeafe;
}

.progress-fill {
  height: 100%;
  border-radius: inherit;
  background: #2563eb;
  transition: width 180ms ease;
}

.stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin: 0;
}

.stats div {
  padding: 0;
  border: 0;
  background: transparent;
}

dt {
  color: #64748b;
  font-size: 12px;
}

dd {
  margin: 3px 0 0;
  font-size: 12px;
  font-weight: 800;
}

.message {
  margin-top: 12px;
  color: #b45309;
  font-size: 12px;
  line-height: 1.45;
}

.actions {
  display: grid;
  gap: 8px;
  margin-top: 16px;
}

button {
  min-height: 40px;
  border: 1px solid #dbe1ea;
  border-radius: 8px;
  padding: 0 12px;
  background: #ffffff;
  color: #111827;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.primary {
  border-color: #2563eb;
  background: #2563eb;
  color: #ffffff;
}

.loading-indicator {
  margin-top: 12px;
  padding: 12px;
  text-align: center;
  color: #64748b;
  font-size: 13px;
}
</style>
