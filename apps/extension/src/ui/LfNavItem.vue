<script setup lang="ts">
defineProps<{
  label: string
  active?: boolean
}>()

defineEmits<{
  click: []
}>()
</script>

<template>
  <button
    class="lf-nav-item"
    :class="{ 'lf-nav-item--active': active }"
    :aria-current="active ? 'page' : undefined"
    type="button"
    @click="$emit('click')"
  >
    {{ label }}
  </button>
</template>

<style scoped>
.lf-nav-item {
  display: block;
  width: 100%;
  padding: 8px 24px;
  border: none;
  border-radius: var(--lf-radius);
  background: transparent;
  color: var(--lf-whisper);
  font-family: var(--lf-font-sans);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  position: relative;
  transition: color 0.15s;
}

.lf-nav-item:hover {
  color: var(--lf-ghost);
}

.lf-nav-item--active {
  color: var(--lf-ink);
}

.lf-nav-item--active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 4px;
  bottom: 4px;
  width: 2px;
  background: var(--lf-accent);
}
</style>
