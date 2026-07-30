<script setup lang="ts">
defineProps<{
  label: string
  variant?: 'primary' | 'ghost' | 'danger' | 'danger-confirm' | 'stop' | 'test'
  disabled?: boolean
  fullWidth?: boolean
}>()

defineEmits<{
  click: []
}>()
</script>

<template>
  <button
    :class="['lf-btn', variant && `lf-btn--${variant}`, fullWidth && 'lf-btn--full']"
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
  min-height: var(--lf-btn-h-primary);
  border: 1px solid var(--lf-rule);
  border-radius: var(--lf-radius);
  padding: 0 18px;
  background: transparent;
  color: var(--lf-ink);
  font-family: var(--lf-font-sans);
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition:
    transform 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease,
    background 0.15s ease,
    box-shadow 0.15s ease;
}

.lf-btn:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--lf-accent) 24%, transparent);
  outline-offset: 2px;
}

.lf-btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.lf-btn:active:not(:disabled) {
  transform: translateY(0);
}

.lf-btn:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

.lf-btn--full {
  width: 100%;
}

/* Primary */
.lf-btn--primary {
  min-width: 120px;
  border-color: var(--lf-accent);
  background: var(--lf-accent);
  color: var(--lf-on-accent);
  box-shadow: 0 6px 14px color-mix(in srgb, var(--lf-accent) 20%, transparent);
}

.lf-btn--primary:hover:not(:disabled) {
  background: var(--lf-accent-hover);
  border-color: var(--lf-accent-hover);
  box-shadow: 0 8px 18px color-mix(in srgb, var(--lf-accent) 25%, transparent);
}

/* Ghost */
.lf-btn--ghost {
  min-height: var(--lf-btn-h-secondary);
  border-color: var(--lf-rule);
  background: var(--lf-paper);
  color: var(--lf-ghost);
  font-size: 12px;
}

.lf-btn--ghost:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--lf-accent) 38%, var(--lf-rule));
  background: color-mix(in srgb, var(--lf-accent) 5%, var(--lf-paper));
  color: var(--lf-ink);
}

/* Danger */
.lf-btn--danger {
  border-color: var(--lf-danger);
  background: var(--lf-danger);
  color: var(--lf-on-accent);
}

.lf-btn--danger:hover:not(:disabled) {
  background: var(--lf-danger-confirm);
  border-color: var(--lf-danger-confirm);
}

/* Danger Confirm */
.lf-btn--danger-confirm {
  border-color: var(--lf-danger-confirm);
  background: var(--lf-danger-confirm);
  color: var(--lf-on-accent);
}

/* Stop an active translation without discarding completed results. */
.lf-btn--stop {
  border-color: var(--lf-danger-confirm);
  background: transparent;
  color: var(--lf-danger-confirm);
}

.lf-btn--stop:hover:not(:disabled) {
  background: color-mix(in srgb, var(--lf-danger-confirm) 9%, transparent);
}

/* Test */
.lf-btn--test {
  min-height: var(--lf-btn-h-small);
  padding: 0 14px;
  border-color: var(--lf-rule);
  background: var(--lf-paper);
  color: var(--lf-ghost);
  font-size: 12px;
  flex-shrink: 0;
}

.lf-btn--test:hover:not(:disabled) {
  border-color: var(--lf-whisper);
  color: var(--lf-ink);
}

@media (prefers-reduced-motion: reduce) {
  .lf-btn {
    transition: none;
  }

  .lf-btn:hover:not(:disabled),
  .lf-btn:active:not(:disabled) {
    transform: none;
  }
}
</style>
