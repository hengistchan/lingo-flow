<script setup lang="ts">
defineProps<{
  label: string
  variant?: 'primary' | 'ghost' | 'danger' | 'danger-confirm' | 'test'
  disabled?: boolean
}>()

defineEmits<{
  click: []
}>()
</script>

<template>
  <button
    :class="['lf-btn', variant && `lf-btn--${variant}`]"
    :disabled="disabled"
    @click="$emit('click')"
  >
    {{ label }}
  </button>
</template>

<style scoped>
.lf-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: var(--lf-btn-h-primary);
  border: 1px solid var(--lf-rule);
  border-radius: var(--lf-radius);
  padding: 0 14px;
  background: transparent;
  color: var(--lf-ink);
  font-family: var(--lf-font-sans);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
  letter-spacing: 0.02em;
}

.lf-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

/* Primary */
.lf-btn--primary {
  height: var(--lf-btn-h-primary);
  width: 100%;
  border-color: var(--lf-accent);
  background: var(--lf-accent);
  color: #ffffff;
}

.lf-btn--primary:hover:not(:disabled) {
  background: var(--lf-accent-hover);
  border-color: var(--lf-accent-hover);
}

/* Ghost */
.lf-btn--ghost {
  height: var(--lf-btn-h-secondary);
  flex: 1;
  border-color: var(--lf-rule);
  background: transparent;
  color: var(--lf-ghost);
  font-size: 12px;
}

.lf-btn--ghost:hover:not(:disabled) {
  border-color: var(--lf-whisper);
  color: var(--lf-ink);
}

/* Danger */
.lf-btn--danger {
  border-color: var(--lf-accent);
  background: var(--lf-accent);
  color: #ffffff;
}

.lf-btn--danger:hover:not(:disabled) {
  background: var(--lf-accent-hover);
  border-color: var(--lf-accent-hover);
}

/* Danger Confirm */
.lf-btn--danger-confirm {
  border-color: #991b1b;
  background: #991b1b;
  color: #ffffff;
}

/* Test */
.lf-btn--test {
  height: var(--lf-btn-h-small);
  padding: 0 14px;
  border-color: var(--lf-rule);
  background: transparent;
  color: var(--lf-ghost);
  font-size: 12px;
  flex-shrink: 0;
  margin-left: auto;
}

.lf-btn--test:hover:not(:disabled) {
  border-color: var(--lf-whisper);
  color: var(--lf-ink);
}
</style>
