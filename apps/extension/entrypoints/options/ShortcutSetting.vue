<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import LfButton from '../../src/ui/LfButton.vue'
import {
  formatCommandShortcut,
  openExtensionShortcutSettings,
  readCommandShortcut,
} from './shortcut-settings'

const props = defineProps<{
  title: string
  description: string
  shortcutLabel: string
  manageLabel: string
  unassignedLabel: string
  managedByBrowserLabel: string
  openFailedLabel: string
  fallbackShortcut: string
}>()

const shortcut = ref(props.fallbackShortcut)
const browserValueLoaded = ref(false)
const openFailed = ref(false)

const displayShortcut = computed(() => {
  if (browserValueLoaded.value && !shortcut.value) return props.unassignedLabel
  return formatCommandShortcut(shortcut.value)
})

const assigned = computed(() => !browserValueLoaded.value || !!shortcut.value)

onMounted(() => {
  void refreshShortcut()
  window.addEventListener('focus', refreshShortcut)
})

onUnmounted(() => window.removeEventListener('focus', refreshShortcut))

async function refreshShortcut() {
  const commands = globalThis.chrome?.commands
  if (typeof commands?.getAll !== 'function') return

  try {
    const current = await readCommandShortcut('translate-hovered-text', commands)
    if (current !== null) {
      shortcut.value = current
      browserValueLoaded.value = true
    }
  } catch {
    // Keep the manifest default visible if the browser API is unavailable.
  }
}

async function manageShortcut() {
  openFailed.value = false
  try {
    const opened = await openExtensionShortcutSettings(globalThis.chrome?.tabs)
    openFailed.value = !opened
  } catch {
    openFailed.value = true
  }
}
</script>

<template>
  <div class="shortcut-setting" :data-assigned="assigned">
    <div class="shortcut-setting__copy">
      <h3>{{ title }}</h3>
      <p>{{ description }}</p>
      <span class="shortcut-setting__ownership">{{ managedByBrowserLabel }}</span>
    </div>
    <div class="shortcut-setting__control">
      <span class="shortcut-setting__label">{{ shortcutLabel }}</span>
      <kbd aria-live="polite">{{ displayShortcut }}</kbd>
      <lf-button variant="ghost" :label="manageLabel" @click="manageShortcut" />
    </div>
    <p v-if="openFailed" class="shortcut-setting__error" role="alert">
      {{ openFailedLabel }}
    </p>
  </div>
</template>

<style scoped>
.shortcut-setting {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 18px 28px;
  padding: 18px 0 18px 18px;
  border-left: 3px solid var(--lf-accent);
}

.shortcut-setting[data-assigned="false"] {
  border-left-color: var(--lf-danger-confirm);
}

.shortcut-setting__copy h3 {
  margin: 0;
  font-family: var(--lf-font-serif);
  font-size: 15px;
  font-weight: 400;
}

.shortcut-setting__copy p {
  max-width: 520px;
  margin: 6px 0 0;
  color: var(--lf-ghost);
  font-size: 12px;
  line-height: 1.55;
}

.shortcut-setting__ownership {
  display: block;
  margin-top: 8px;
  color: var(--lf-whisper);
  font-size: 11px;
}

.shortcut-setting__control {
  display: grid;
  justify-items: stretch;
  gap: 7px;
  min-width: 164px;
}

.shortcut-setting__label {
  color: var(--lf-ghost);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

kbd {
  box-sizing: border-box;
  min-width: 164px;
  padding: 8px 10px;
  border: 1px solid var(--lf-rule);
  border-bottom-width: 3px;
  border-radius: 0;
  background: var(--lf-paper);
  color: var(--lf-ink);
  font-family: var(--lf-font-sans);
  font-size: 12px;
  font-weight: 650;
  text-align: center;
}

.shortcut-setting[data-assigned="false"] kbd {
  color: var(--lf-accent);
}

.shortcut-setting__error {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--lf-accent);
  font-size: 12px;
}

@media (max-width: 680px) {
  .shortcut-setting {
    grid-template-columns: 1fr;
  }

  .shortcut-setting__control {
    justify-items: start;
  }
}
</style>
