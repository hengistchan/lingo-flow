<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { MessageResponse, PageTranslationProgress } from '@lingoflow/types'

const progress = ref<PageTranslationProgress>({
  status: 'idle',
  totalBlocks: 0,
  translatedBlocks: 0,
  cacheHits: 0,
  failedBlocks: 0,
})
const busy = ref(false)
const pageMessage = ref('')
let pollTimer: number | undefined

const statusLabel = computed(() => {
  if (progress.value.status === 'idle') return 'Ready'
  if (progress.value.status === 'translating') return 'Translating'
  if (progress.value.status === 'done') return 'Done'
  return 'Failed'
})

const completion = computed(() => {
  if (progress.value.totalBlocks === 0) return 0
  return Math.round(((progress.value.translatedBlocks + progress.value.failedBlocks) / progress.value.totalBlocks) * 100)
})

onMounted(() => {
  void refreshStatus()
  pollTimer = window.setInterval(refreshStatus, 900)
})

onUnmounted(() => {
  if (pollTimer) window.clearInterval(pollTimer)
})

async function translatePage() {
  busy.value = true
  pageMessage.value = ''

  try {
    const tab = await getActiveTab()
    await ensureContentRuntime(tab.id)
    progress.value = await sendTabMessage<PageTranslationProgress>(tab.id, { type: 'page/translate' })
  } catch (error) {
    pageMessage.value = error instanceof Error ? error.message : String(error)
    progress.value.status = 'failed'
  } finally {
    busy.value = false
  }
}

async function clearTranslation() {
  busy.value = true
  pageMessage.value = ''

  try {
    const tab = await getActiveTab()
    await ensureContentRuntime(tab.id)
    progress.value = await sendTabMessage<PageTranslationProgress>(tab.id, { type: 'page/clear' })
  } catch (error) {
    pageMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    busy.value = false
  }
}

async function refreshStatus() {
  try {
    const tab = await getActiveTab()
    await ensureContentRuntime(tab.id)
    progress.value = await sendTabMessage<PageTranslationProgress>(tab.id, { type: 'page/status' })
  } catch {
    progress.value.status = 'idle'
  }
}

async function openSettings() {
  await chrome.runtime.openOptionsPage()
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
  } catch (firstError) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content-scripts/content.js'],
      })
    } catch {
      throw firstError
    }
  }
}

async function sendTabMessage<T>(tabId: number, message: unknown): Promise<T> {
  const response = (await chrome.tabs.sendMessage(tabId, message)) as MessageResponse<T>
  if (!response?.ok) {
    throw new Error(response?.error?.message ?? 'Page message failed.')
  }
  return response.data
}
</script>

<template>
  <main class="popup">
    <header class="header">
      <span class="brand-mark">LF</span>
      <div>
        <h1>LingoFlow</h1>
        <p>{{ statusLabel }}</p>
      </div>
      <span class="status-dot" :data-status="progress.status" />
    </header>

    <section v-if="progress.status !== 'translating'" class="ready-card">
      <div class="info-row">
        <span>Source language</span>
        <strong>English detected</strong>
      </div>
      <div class="info-row">
        <span>Provider</span>
        <strong>Configured provider</strong>
      </div>
      <div class="info-row">
        <span>Render mode</span>
        <strong>Below original text</strong>
      </div>
    </section>

    <section v-else class="translation-card">
      <h2>Translating page</h2>
      <div class="progress-track" aria-hidden="true">
        <div class="progress-fill" :style="{ width: `${completion}%` }" />
      </div>
      <dl class="stats">
        <div>
          <dt>Progress</dt>
          <dd>{{ progress.translatedBlocks + progress.failedBlocks }}/{{ progress.totalBlocks }}</dd>
        </div>
        <div>
          <dt>Cache hits</dt>
          <dd>{{ progress.cacheHits }}</dd>
        </div>
        <div>
          <dt>Failed</dt>
          <dd>{{ progress.failedBlocks }}</dd>
        </div>
      </dl>
    </section>

    <p v-if="progress.message || pageMessage" class="message">
      {{ progress.message || pageMessage }}
    </p>

    <div class="actions">
      <button class="primary" :disabled="busy || progress.status === 'translating'" @click="translatePage">
        Translate Page
      </button>
      <button :disabled="busy" @click="clearTranslation">Clear Translation</button>
      <button class="link" @click="openSettings">Open Settings</button>
    </div>
  </main>
</template>

<style scoped>
:global(body) {
  margin: 0;
  min-width: 292px;
  background: #f5f5f5;
  color: #111827;
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.popup {
  width: 292px;
  box-sizing: border-box;
  padding: 18px;
  background: #ffffff;
}

.header {
  display: flex;
  align-items: center;
  gap: 9px;
}

h1 {
  margin: 0;
  font-size: 13px;
  line-height: 1.2;
  font-weight: 800;
}

p {
  margin: 3px 0 0;
  color: #6b7280;
  font-size: 11px;
}

.brand-mark {
  display: grid;
  width: 20px;
  height: 20px;
  place-items: center;
  border-radius: 6px;
  background: #2563eb;
  color: #ffffff;
  font-size: 9px;
  font-weight: 800;
}

.status-dot {
  width: 6px;
  height: 6px;
  margin-left: auto;
  flex: 0 0 auto;
  border-radius: 999px;
  background: #9ca3af;
}

.status-dot[data-status="translating"] {
  background: #2563eb;
  box-shadow: 0 0 0 4px rgb(37 99 235 / 12%);
}

.status-dot[data-status="done"] {
  background: #10b981;
}

.status-dot[data-status="failed"] {
  background: #dc2626;
}

.ready-card,
.translation-card {
  margin-top: 16px;
  padding: 13px;
  border-radius: 8px;
  background: #f8fafc;
}

.info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 28px;
  color: #6b7280;
  font-size: 11px;
}

.info-row + .info-row {
  border-top: 1px solid #e5e7eb;
}

.info-row strong {
  color: #111827;
  font-size: 11px;
  font-weight: 700;
  text-align: right;
}

.translation-card h2 {
  margin: 0 0 10px;
  font-size: 13px;
}

.progress-track {
  height: 5px;
  margin: 0 0 10px;
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
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin: 0;
}

.stats div {
  padding: 0;
  border: 0;
  background: transparent;
}

dt {
  color: #6b7280;
  font-size: 10px;
}

dd {
  margin: 3px 0 0;
  font-size: 11px;
  font-weight: 800;
}

.message {
  margin: 14px 0 0;
  color: #92400e;
}

.actions {
  display: grid;
  gap: 8px;
  margin-top: 18px;
}

button {
  min-height: 38px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #ffffff;
  color: #111827;
  font: inherit;
  font-size: 12px;
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

.link {
  border-color: transparent;
  background: transparent;
  color: #2563eb;
}
</style>
