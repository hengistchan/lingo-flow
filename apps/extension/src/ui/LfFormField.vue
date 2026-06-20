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
  gap: 6px;
}

.lf-field--check {
  flex-direction: row;
  align-items: center;
  gap: 9px;
}

.lf-field__label {
  color: var(--lf-ghost);
  font-size: 12px;
  font-weight: 600;
}

.lf-field__input,
.lf-field__select {
  height: var(--lf-input-h);
  box-sizing: border-box;
  width: 100%;
  border: 1px solid var(--lf-rule);
  border-radius: var(--lf-radius);
  padding: 0 11px;
  background: var(--lf-paper);
  color: var(--lf-ink);
  font-family: var(--lf-font-sans);
  font-size: 13px;
  transition: border-color 0.15s;
}

.lf-field__input:focus,
.lf-field__select:focus {
  outline: none;
  border-color: var(--lf-accent);
}

.lf-field__checkbox {
  width: 16px;
  height: 16px;
  accent-color: var(--lf-accent);
}
</style>
