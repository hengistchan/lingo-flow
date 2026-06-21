<script setup lang="ts">
defineProps<{
  sourceLabel: string
  targetLabel: string
  targetSelectLabel?: string
  currentTarget?: string
  options?: { value: string; label: string }[]
  disabled?: boolean
}>()

defineEmits<{
  'update:target': [value: string]
}>()
</script>

<template>
  <div class="lf-lang-pair">
    <span class="lf-lang-pair__source">{{ sourceLabel }}</span>
    <span class="lf-lang-pair__dash" aria-hidden="true">—</span>
    <span class="lf-lang-pair__target">
      <select
        class="lf-lang-pair__select"
        :aria-label="targetSelectLabel"
        :value="currentTarget"
        :disabled="disabled"
        @change="$emit('update:target', ($event.target as HTMLSelectElement).value)"
      >
        <option v-for="opt in options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
      </select>
      <span class="lf-lang-pair__target-display" aria-hidden="true">{{ targetLabel }}</span>
    </span>
  </div>
</template>

<style scoped>
.lf-lang-pair {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 8px;
  padding: 16px 0;
  border-top: 1px solid var(--lf-rule);
  border-bottom: 1px solid var(--lf-rule);
  flex-wrap: nowrap;
}

.lf-lang-pair__source {
  font-family: var(--lf-font-serif);
  font-size: 20px;
  color: var(--lf-ghost);
  white-space: nowrap;
}

.lf-lang-pair__dash {
  font-family: var(--lf-font-serif);
  font-size: 20px;
  color: var(--lf-whisper);
  white-space: nowrap;
}

.lf-lang-pair__target {
  position: relative;
  font-family: var(--lf-font-serif);
  font-size: 20px;
  color: var(--lf-ink);
  cursor: pointer;
  white-space: nowrap;
}

.lf-lang-pair__select {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
  font-family: inherit;
  font-size: inherit;
}

.lf-lang-pair__target-display {
  pointer-events: none;
  border-bottom: 1px solid transparent;
  transition: border-color 0.15s;
}

.lf-lang-pair__target:hover .lf-lang-pair__target-display {
  border-bottom-color: var(--lf-accent);
}
</style>
