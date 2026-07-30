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
  min-height: 40px;
  padding: 9px 12px;
  border: none;
  border-radius: var(--lf-radius);
  background: transparent;
  color: var(--lf-ghost);
  font-family: var(--lf-font-sans);
  font-size: 13px;
  font-weight: 520;
  line-height: 1.35;
  text-align: left;
  cursor: pointer;
  position: relative;
  transition:
    color 0.16s ease,
    background-color 0.16s ease,
    transform 0.16s ease;
}

.lf-nav-item:hover {
  background: var(--lf-margin);
  color: var(--lf-ink);
}

.lf-nav-item:active {
  transform: translateY(1px);
}

.lf-nav-item:focus-visible {
  outline: 2px solid var(--lf-accent);
  outline-offset: 2px;
}

.lf-nav-item--active {
  background: color-mix(in srgb, var(--lf-accent) 11%, var(--lf-paper));
  color: var(--lf-accent);
  font-weight: 650;
}

@media (prefers-reduced-motion: reduce) {
  .lf-nav-item {
    transition: none;
  }

  .lf-nav-item:active {
    transform: none;
  }
}
</style>
