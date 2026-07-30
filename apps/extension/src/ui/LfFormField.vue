<script setup lang="ts">
defineProps<{
  label: string
  type?: 'text' | 'password' | 'url' | 'number' | 'select' | 'checkbox'
  modelValue?: string | number | boolean
  placeholder?: string
  disabled?: boolean
  options?: { value: string | number; label: string }[]
  min?: number
  max?: number
  step?: number
}>()

defineEmits<{
  'update:modelValue': [value: string | number | boolean]
}>()
</script>

<template>
  <label :class="['lf-field', type === 'checkbox' && 'lf-field--check']">
    <span class="lf-field__label">{{ label }}</span>

    <template v-if="type === 'select'">
      <select
        class="lf-field__select"
        :value="modelValue"
        :disabled="disabled"
        @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
      >
        <option
          v-for="opt in options"
          :key="opt.value"
          :value="opt.value"
        >
          {{ opt.label }}
        </option>
      </select>
    </template>

    <template v-else-if="type === 'checkbox'">
      <input
        class="lf-field__checkbox"
        type="checkbox"
        :checked="!!modelValue"
        :disabled="disabled"
        @change="$emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
      />
    </template>

    <template v-else>
      <input
        class="lf-field__input"
        :type="type ?? 'text'"
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        :min="min"
        :max="max"
        :step="step"
        autocomplete="off"
        @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />
    </template>
  </label>
</template>

<style scoped>
.lf-field {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.lf-field--check {
  flex-direction: row;
  align-items: center;
  gap: 9px;
}

.lf-field__label {
  color: var(--lf-ghost);
  font-size: 12px;
  font-weight: 650;
}

.lf-field__input,
.lf-field__select {
  height: var(--lf-input-h);
  box-sizing: border-box;
  width: 100%;
  border: 1px solid var(--lf-rule);
  border-radius: var(--lf-radius);
  padding: 0 12px;
  background: color-mix(in srgb, var(--lf-paper) 96%, var(--lf-margin));
  color: var(--lf-ink);
  font-family: var(--lf-font-sans);
  font-size: 13px;
  transition:
    border-color 0.15s ease,
    background 0.15s ease,
    box-shadow 0.15s ease;
}

.lf-field__input:hover:not(:disabled),
.lf-field__select:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--lf-accent) 28%, var(--lf-rule));
}

.lf-field__input:focus-visible,
.lf-field__select:focus-visible {
  outline: none;
  border-color: var(--lf-accent);
  background: var(--lf-paper);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--lf-accent) 16%, transparent);
}

.lf-field__input:disabled,
.lf-field__select:disabled {
  cursor: not-allowed;
  opacity: 0.56;
}

.lf-field__checkbox {
  width: 17px;
  height: 17px;
  accent-color: var(--lf-accent);
}

@media (prefers-reduced-motion: reduce) {
  .lf-field__input,
  .lf-field__select {
    transition: none;
  }
}
</style>
