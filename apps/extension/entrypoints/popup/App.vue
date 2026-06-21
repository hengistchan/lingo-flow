<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import LfButton from '../../src/ui/LfButton.vue'
import LfLanguagePair from '../../src/ui/LfLanguagePair.vue'
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
  providerId: 'google-free-translate',
  providerName: 'Google Translate Free (experimental)',
  providerConfigured: !extensionApiAvailable.value,
})
const progress = ref<PageTranslationProgress>(idleProgress())
const pendingTargetLang = ref(summary.value.targetLang)
const targetSelectionTouched = ref(false)
const busy = ref(false)
const actionFailed = ref(false)
const contentInjected = ref(false)
const isDarkMode = ref(window.matchMedia('(prefers-color-scheme: dark)').matches)
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
    setTimeout(() => { cacheMessage.value = '' }, 5000)
  } catch {
    cacheMessage.value = copy('popup.siteCacheFailed')
    setTimeout(() => { cacheMessage.value = '' }, 5000)
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

function toggleDarkMode() {
  isDarkMode.value = !isDarkMode.value
  const root = document.documentElement
  root.classList.remove('dark', 'light')
  root.classList.add(isDarkMode.value ? 'dark' : 'light')
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

function onTargetChange(value: string) {
  pendingTargetLang.value = value
  targetSelectionTouched.value = true
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
      <h1>LingoFlow</h1>
      <div class="header-actions">
        <button
          class="icon-button"
          :aria-label="copy('popup.toggleDarkMode')"
          :title="copy('popup.toggleDarkMode')"
          @click="toggleDarkMode"
        >
          <svg v-if="isDarkMode" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
          <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="5" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
        </button>
        <button
          class="icon-button"
          :aria-label="copy('popup.settings')"
          :title="copy('popup.settings')"
          @click="openSettings"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
    </header>

    <p class="status" aria-live="polite">{{ statusLabel }}</p>

    <section v-if="loading" class="loading-indicator">
      <p>{{ copy("popup.loading") }}</p>
    </section>

    <lf-language-pair
      :source-label="copy('popup.autoDetect')"
      :target-label="targetLanguageName"
      :target-select-label="copy('popup.targetLanguage')"
      :current-target="pendingTargetLang"
      :options="targetLanguages.map(l => ({ value: l.code, label: getLanguageLabel(l.code, uiLocale) }))"
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

.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
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
