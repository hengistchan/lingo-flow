<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { validateGlossary } from '@lingoflow/glossary'
import type { Glossary, GlossaryEntry, UiLocale } from '@lingoflow/types'
import {
  createGlossary,
  createGlossaryEntry,
  exportGlossaries,
  importGlossaries,
  parseScopeList,
} from './terminology-manager'

const props = defineProps<{
  glossaries: Glossary[]
  locale: UiLocale
}>()

const emit = defineEmits<{
  'update:glossaries': [glossaries: Glossary[]]
}>()

const selectedId = ref(props.glossaries[0]?.id ?? '')
const message = ref('')
const pendingDeleteId = ref('')

const selected = computed(() =>
  props.glossaries.find(glossary => glossary.id === selectedId.value),
)

const validationErrors = computed(() => {
  if (!selected.value) return []
  const existing = props.glossaries.filter(item => item.id !== selected.value?.id)
  const result = validateGlossary(selected.value, existing)
  return result.ok ? [] : result.errors
})

watch(() => props.glossaries, glossaries => {
  if (!glossaries.some(item => item.id === selectedId.value)) {
    selectedId.value = glossaries[0]?.id ?? ''
  }
}, { deep: true })

function copy(key: keyof typeof COPY.en): string {
  return COPY[props.locale][key]
}

function addGlossary(): void {
  const next = createGlossary(props.glossaries)
  emit('update:glossaries', [...cloneJson(props.glossaries), next])
  selectedId.value = next.id
  message.value = copy('created')
}

function updateGlossary(update: (glossary: Glossary) => void): void {
  const glossaries = cloneJson(props.glossaries)
  const glossary = glossaries.find(item => item.id === selectedId.value)
  if (!glossary) return
  update(glossary)
  glossary.updatedAt = new Date().toISOString()
  emit('update:glossaries', glossaries)
  message.value = ''
}

function updateField<K extends keyof Glossary>(key: K, value: Glossary[K]): void {
  updateGlossary(glossary => {
    glossary[key] = value
  })
}

function updateScope(key: 'domains' | 'ruleIds', value: string): void {
  updateGlossary(glossary => {
    const parsed = parseScopeList(value)
    if (parsed) glossary.scope[key] = parsed
    else delete glossary.scope[key]
  })
}

function addEntry(): void {
  updateGlossary(glossary => {
    glossary.entries.push(createGlossaryEntry(glossary.entries))
  })
}

function updateEntry(id: string, update: (entry: GlossaryEntry) => void): void {
  updateGlossary(glossary => {
    const entry = glossary.entries.find(item => item.id === id)
    if (entry) update(entry)
  })
}

function removeEntry(id: string): void {
  updateGlossary(glossary => {
    glossary.entries = glossary.entries.filter(item => item.id !== id)
  })
}

function deleteGlossary(id: string): void {
  if (pendingDeleteId.value !== id) {
    pendingDeleteId.value = id
    window.setTimeout(() => {
      if (pendingDeleteId.value === id) pendingDeleteId.value = ''
    }, 3000)
    return
  }
  const remaining = props.glossaries.filter(item => item.id !== id)
  emit('update:glossaries', cloneJson(remaining))
  selectedId.value = remaining[0]?.id ?? ''
  pendingDeleteId.value = ''
  message.value = copy('deleted')
}

function downloadGlossaries(): void {
  const blob = new Blob([exportGlossaries(props.glossaries)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `lingoflow-terminology-${new Date().toISOString().slice(0, 10)}.json`
  anchor.click()
  URL.revokeObjectURL(url)
  message.value = copy('exported')
}

function chooseImport(): void {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json,application/json'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    try {
      const glossaries = importGlossaries(await file.text(), props.glossaries)
      emit('update:glossaries', glossaries)
      selectedId.value = glossaries.at(-1)?.id ?? selectedId.value
      message.value = copy('imported')
    } catch (error) {
      message.value = error instanceof Error ? error.message : String(error)
    }
  }
  input.click()
}

function scopeText(values?: string[]): string {
  return values?.join(', ') ?? ''
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

const COPY = {
  en: {
    eyebrow: 'Consistency layer',
    title: 'Terminology',
    description: 'Protect product names and domain terms so every translated block uses the same wording.',
    addGlossary: 'New glossary',
    import: 'Import',
    export: 'Export',
    emptyTitle: 'Create your first terminology list',
    emptyDescription: 'Start with a few terms that must never drift across a page.',
    enabled: 'Enabled',
    disabled: 'Disabled',
    name: 'Glossary name',
    id: 'Stable ID',
    domains: 'Website scope',
    domainsHint: 'Comma separated: docs.example.com, *.example.org. Leave blank for every website.',
    rules: 'Rule scope',
    rulesHint: 'Optional rule IDs, comma separated.',
    source: 'Source term',
    target: 'Required translation',
    matching: 'Matching',
    term: 'Term',
    exact: 'Whole block',
    case: 'Case sensitive',
    active: 'Use',
    addTerm: 'Add term',
    noTerms: 'No terms yet. Add the wording you want LingoFlow to preserve.',
    remove: 'Remove',
    delete: 'Delete glossary',
    confirmDelete: 'Confirm delete',
    errors: 'Resolve before saving',
    savedByMain: 'Changes are saved with the main Save settings button.',
    created: 'Glossary created.',
    deleted: 'Glossary deleted.',
    imported: 'Terminology imported. Review and save settings.',
    exported: 'Terminology exported.',
  },
  'zh-Hans': {
    eyebrow: '一致性层',
    title: '术语管理',
    description: '保护产品名和领域术语，让同一页面的所有译文使用一致表达。',
    addGlossary: '新建术语表',
    import: '导入',
    export: '导出',
    emptyTitle: '创建第一份术语表',
    emptyDescription: '先加入几个不能在页面中发生漂移的关键术语。',
    enabled: '已启用',
    disabled: '已停用',
    name: '术语表名称',
    id: '稳定 ID',
    domains: '网站范围',
    domainsHint: '逗号分隔：docs.example.com、*.example.org；留空表示所有网站。',
    rules: '规则范围',
    rulesHint: '可选，填写逗号分隔的规则 ID。',
    source: '原始术语',
    target: '固定译法',
    matching: '匹配方式',
    term: '术语',
    exact: '整个文本块',
    case: '区分大小写',
    active: '使用',
    addTerm: '添加术语',
    noTerms: '还没有术语。加入希望 LingoFlow 固定使用的表达。',
    remove: '移除',
    delete: '删除术语表',
    confirmDelete: '确认删除',
    errors: '保存前需要修正',
    savedByMain: '修改将随右上角“保存设置”一起保存。',
    created: '已创建术语表。',
    deleted: '已删除术语表。',
    imported: '术语已导入，请检查并保存设置。',
    exported: '术语已导出。',
  },
} as const
</script>

<template>
  <section class="terminology" aria-labelledby="terminology-title">
    <header class="terminology__header">
      <div>
        <p class="terminology__eyebrow">{{ copy('eyebrow') }}</p>
        <h2 id="terminology-title">{{ copy('title') }}</h2>
        <p>{{ copy('description') }}</p>
      </div>
      <div class="terminology__actions">
        <button type="button" class="button-secondary" @click="chooseImport">{{ copy('import') }}</button>
        <button type="button" class="button-secondary" :disabled="glossaries.length === 0" @click="downloadGlossaries">
          {{ copy('export') }}
        </button>
        <button type="button" class="button-primary" @click="addGlossary">{{ copy('addGlossary') }}</button>
      </div>
    </header>

    <p v-if="message" class="terminology__message" aria-live="polite">{{ message }}</p>

    <div v-if="glossaries.length === 0" class="terminology-empty">
      <span aria-hidden="true">Aa → 字</span>
      <h3>{{ copy('emptyTitle') }}</h3>
      <p>{{ copy('emptyDescription') }}</p>
      <button type="button" class="button-primary" @click="addGlossary">{{ copy('addGlossary') }}</button>
    </div>

    <div v-else class="terminology-workbench">
      <nav class="glossary-list" :aria-label="copy('title')">
        <button
          v-for="glossary in glossaries"
          :key="glossary.id"
          type="button"
          :class="{ active: glossary.id === selectedId }"
          @click="selectedId = glossary.id"
        >
          <span>{{ glossary.name }}</span>
          <small>{{ glossary.entries.length }} · {{ glossary.enabled ? copy('enabled') : copy('disabled') }}</small>
        </button>
      </nav>

      <div v-if="selected" class="glossary-editor">
        <div class="glossary-editor__topline">
          <label class="toggle">
            <input
              type="checkbox"
              :checked="selected.enabled"
              @change="updateField('enabled', ($event.target as HTMLInputElement).checked)"
            >
            <span>{{ selected.enabled ? copy('enabled') : copy('disabled') }}</span>
          </label>
          <button type="button" class="button-danger" @click="deleteGlossary(selected.id)">
            {{ pendingDeleteId === selected.id ? copy('confirmDelete') : copy('delete') }}
          </button>
        </div>

        <div class="glossary-fields">
          <label>
            <span>{{ copy('name') }}</span>
            <input
              :value="selected.name"
              @input="updateField('name', ($event.target as HTMLInputElement).value)"
            >
          </label>
          <label>
            <span>{{ copy('id') }}</span>
            <input
              :value="selected.id"
              spellcheck="false"
              @input="updateField('id', ($event.target as HTMLInputElement).value)"
            >
          </label>
          <label class="wide">
            <span>{{ copy('domains') }}</span>
            <input
              :value="scopeText(selected.scope.domains)"
              placeholder="docs.example.com, *.example.org"
              spellcheck="false"
              @input="updateScope('domains', ($event.target as HTMLInputElement).value)"
            >
            <small>{{ copy('domainsHint') }}</small>
          </label>
          <label class="wide">
            <span>{{ copy('rules') }}</span>
            <input
              :value="scopeText(selected.scope.ruleIds)"
              placeholder="docs-page, user:adapt-example.com"
              spellcheck="false"
              @input="updateScope('ruleIds', ($event.target as HTMLInputElement).value)"
            >
            <small>{{ copy('rulesHint') }}</small>
          </label>
        </div>

        <div v-if="validationErrors.length" class="validation-panel" role="alert">
          <strong>{{ copy('errors') }}</strong>
          <ul>
            <li v-for="error in validationErrors" :key="`${error.field}:${error.message}`">
              {{ error.message }}
            </li>
          </ul>
        </div>

        <div class="terms-heading">
          <div>
            <h3>{{ copy('title') }}</h3>
            <p>{{ copy('savedByMain') }}</p>
          </div>
          <button type="button" class="button-secondary" @click="addEntry">{{ copy('addTerm') }}</button>
        </div>

        <p v-if="selected.entries.length === 0" class="terms-empty">{{ copy('noTerms') }}</p>

        <div v-else class="term-table">
          <div class="term-table__head" aria-hidden="true">
            <span>{{ copy('source') }}</span>
            <span>{{ copy('target') }}</span>
            <span>{{ copy('matching') }}</span>
            <span>{{ copy('case') }}</span>
            <span>{{ copy('active') }}</span>
            <span></span>
          </div>
          <div v-for="entry in selected.entries" :key="entry.id" class="term-row">
            <input
              :aria-label="copy('source')"
              :value="entry.source"
              @input="updateEntry(entry.id, item => item.source = ($event.target as HTMLInputElement).value)"
            >
            <input
              :aria-label="copy('target')"
              :value="entry.target"
              @input="updateEntry(entry.id, item => item.target = ($event.target as HTMLInputElement).value)"
            >
            <select
              :aria-label="copy('matching')"
              :value="entry.match"
              @change="updateEntry(entry.id, item => item.match = ($event.target as HTMLSelectElement).value as GlossaryEntry['match'])"
            >
              <option value="term">{{ copy('term') }}</option>
              <option value="exact">{{ copy('exact') }}</option>
            </select>
            <input
              type="checkbox"
              :aria-label="copy('case')"
              :checked="entry.caseSensitive"
              @change="updateEntry(entry.id, item => item.caseSensitive = ($event.target as HTMLInputElement).checked)"
            >
            <input
              type="checkbox"
              :aria-label="copy('active')"
              :checked="entry.enabled"
              @change="updateEntry(entry.id, item => item.enabled = ($event.target as HTMLInputElement).checked)"
            >
            <button type="button" class="term-remove" :aria-label="copy('remove')" @click="removeEntry(entry.id)">×</button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.terminology {
  color: var(--lf-ink);
}

.terminology__header,
.glossary-editor__topline,
.terms-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
}

.terminology__header h2,
.terms-heading h3 {
  margin: 0;
}

.terminology__header p,
.terms-heading p,
.terminology-empty p {
  margin: 6px 0 0;
  color: var(--lf-muted);
  line-height: 1.55;
}

.terminology__eyebrow {
  color: var(--lf-accent) !important;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .13em;
  text-transform: uppercase;
}

.terminology__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

button {
  min-height: 36px;
  border: 1px solid var(--lf-rule);
  background: var(--lf-paper);
  color: var(--lf-ink);
  cursor: pointer;
  font: inherit;
  font-weight: 650;
  padding: 8px 13px;
}

button:focus-visible,
input:focus-visible,
select:focus-visible {
  outline: 2px solid var(--lf-accent);
  outline-offset: 2px;
}

button:disabled {
  cursor: default;
  opacity: .45;
}

.button-primary {
  border-color: var(--lf-accent);
  background: var(--lf-accent);
  color: #fff;
}

.button-danger,
.term-remove {
  color: var(--lf-danger, #a33a2b);
}

.terminology__message {
  margin: 16px 0 0;
  padding: 9px 12px;
  border-left: 3px solid var(--lf-accent);
  background: color-mix(in srgb, var(--lf-accent) 8%, var(--lf-paper));
}

.terminology-empty {
  margin-top: 28px;
  padding: 56px 24px;
  text-align: center;
  border: 1px dashed var(--lf-rule);
}

.terminology-empty > span {
  display: block;
  color: var(--lf-accent);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 24px;
}

.terminology-empty h3 {
  margin: 14px 0 0;
}

.terminology-empty button {
  margin-top: 20px;
}

.terminology-workbench {
  display: grid;
  grid-template-columns: minmax(160px, 210px) minmax(0, 1fr);
  margin-top: 28px;
  border: 1px solid var(--lf-rule);
}

.glossary-list {
  padding: 10px;
  border-right: 1px solid var(--lf-rule);
  background: color-mix(in srgb, var(--lf-ink) 2%, var(--lf-paper));
}

.glossary-list button {
  display: block;
  width: 100%;
  margin-bottom: 4px;
  border-color: transparent;
  background: transparent;
  text-align: left;
}

.glossary-list button.active {
  border-color: var(--lf-rule);
  background: var(--lf-paper);
  box-shadow: inset 3px 0 0 var(--lf-accent);
}

.glossary-list span,
.glossary-list small {
  display: block;
}

.glossary-list small {
  margin-top: 3px;
  color: var(--lf-muted);
  font-weight: 400;
}

.glossary-editor {
  min-width: 0;
  padding: 22px;
}

.toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 650;
}

.glossary-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-top: 22px;
}

.glossary-fields label {
  display: grid;
  gap: 7px;
  font-size: 12px;
  font-weight: 650;
}

.glossary-fields label.wide {
  grid-column: 1 / -1;
}

.glossary-fields input,
.term-row input:not([type="checkbox"]),
.term-row select {
  box-sizing: border-box;
  width: 100%;
  min-height: 38px;
  border: 1px solid var(--lf-rule);
  border-radius: 0;
  background: var(--lf-paper);
  color: var(--lf-ink);
  font: inherit;
  padding: 8px 10px;
}

.glossary-fields small {
  color: var(--lf-muted);
  font-weight: 400;
  line-height: 1.45;
}

.validation-panel {
  margin-top: 18px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--lf-danger, #a33a2b) 45%, var(--lf-rule));
  color: var(--lf-danger, #a33a2b);
}

.validation-panel ul {
  margin: 7px 0 0;
  padding-left: 20px;
}

.terms-heading {
  align-items: center;
  margin-top: 28px;
  padding-top: 20px;
  border-top: 1px solid var(--lf-rule);
}

.terms-empty {
  margin: 18px 0 0;
  padding: 22px;
  border: 1px dashed var(--lf-rule);
  color: var(--lf-muted);
}

.term-table {
  margin-top: 18px;
  overflow-x: auto;
}

.term-table__head,
.term-row {
  display: grid;
  grid-template-columns: minmax(130px, 1fr) minmax(130px, 1fr) 110px 64px 48px 38px;
  gap: 8px;
  align-items: center;
  min-width: 650px;
}

.term-table__head {
  padding: 0 0 7px;
  color: var(--lf-muted);
  font-size: 11px;
  font-weight: 700;
}

.term-row {
  padding: 8px 0;
  border-top: 1px solid var(--lf-rule);
}

.term-row input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--lf-accent);
}

.term-remove {
  min-height: 32px;
  padding: 4px;
  font-size: 19px;
}

@media (max-width: 820px) {
  .terminology__header {
    display: block;
  }

  .terminology__actions {
    justify-content: flex-start;
    margin-top: 18px;
  }

  .terminology-workbench {
    grid-template-columns: 1fr;
  }

  .glossary-list {
    display: flex;
    gap: 5px;
    overflow-x: auto;
    border-right: 0;
    border-bottom: 1px solid var(--lf-rule);
  }

  .glossary-list button {
    min-width: 160px;
    margin: 0;
  }

  .glossary-fields {
    grid-template-columns: 1fr;
  }

  .glossary-fields label.wide {
    grid-column: auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  * {
    scroll-behavior: auto !important;
  }
}
</style>
