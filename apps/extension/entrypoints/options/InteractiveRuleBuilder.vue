<script setup lang="ts">
import type {
  RuleSelectionKind,
  SelectorCandidate,
  UiLocale,
  UserSiteRule,
} from '@lingoflow/types'
import { watch } from 'vue'
import { useSiteAdaptation } from './useSiteAdaptation'

const props = defineProps<{
  existingRules: UserSiteRule[]
  locale: UiLocale
  saveRule: (rule: UserSiteRule) => Promise<boolean>
  autoStartKind?: RuleSelectionKind
  targetTabId?: number
}>()

const adaptation = useSiteAdaptation(() => props.existingRules)
let autoStarted = false

watch(
  () => props.autoStartKind,
  kind => {
    if (!kind || autoStarted || adaptation.stage.value !== 'idle') return
    autoStarted = true
    void adaptation.begin(kind, props.targetTabId)
  },
  { immediate: true },
)

function copy(key: keyof typeof COPY.en): string {
  return COPY[props.locale][key]
}

async function saveDraft(): Promise<void> {
  if (!adaptation.draftRule.value) return
  const rule = JSON.parse(JSON.stringify(adaptation.draftRule.value)) as UserSiteRule
  const saved = await props.saveRule(rule)
  if (saved) adaptation.reset()
}

function chooseFromEvent(event: Event): void {
  const selector = (event.target as HTMLSelectElement).value
  const candidate = adaptation.selection.value?.candidates.find(item => item.selector === selector)
  if (candidate) void adaptation.chooseCandidate(candidate)
}

function candidateLabel(candidate: SelectorCandidate): string {
  const matchCopy = props.locale === 'zh-Hans'
    ? `匹配 ${candidate.matchCount} 个元素`
    : `${candidate.matchCount} match${candidate.matchCount === 1 ? '' : 'es'}`
  return `${candidate.selector} · ${candidate.stabilityScore}/100 · ${matchCopy}`
}
</script>

<template>
  <section class="adaptation-studio" aria-labelledby="adaptation-title">
    <div class="adaptation-studio__intro">
      <div>
        <p class="adaptation-studio__eyebrow">{{ copy('eyebrow') }}</p>
        <h3 id="adaptation-title">{{ copy('title') }}</h3>
        <p>{{ copy('description') }}</p>
      </div>
      <span class="adaptation-studio__local">{{ copy('localOnly') }}</span>
    </div>

    <div v-if="adaptation.stage.value === 'idle'" class="adaptation-actions">
      <button type="button" @click="adaptation.begin('content-root')">
        <strong>{{ copy('chooseMain') }}</strong>
        <span>{{ copy('chooseMainHint') }}</span>
      </button>
      <button type="button" @click="adaptation.begin('exclude')">
        <strong>{{ copy('chooseExclude') }}</strong>
        <span>{{ copy('chooseExcludeHint') }}</span>
      </button>
      <button type="button" @click="adaptation.begin('placement')">
        <strong>{{ copy('choosePlacement') }}</strong>
        <span>{{ copy('choosePlacementHint') }}</span>
      </button>
    </div>

    <div
      v-else-if="adaptation.stage.value === 'selecting'"
      class="adaptation-state"
      aria-live="polite"
    >
      <span class="adaptation-state__pulse" aria-hidden="true"></span>
      <div>
        <strong>{{ copy('selecting') }}</strong>
        <p>{{ copy('selectingHint') }}</p>
      </div>
    </div>

    <div
      v-else-if="adaptation.stage.value === 'testing'"
      class="adaptation-state"
      aria-live="polite"
    >
      <span class="adaptation-state__pulse" aria-hidden="true"></span>
      <div>
        <strong>{{ copy('testing') }}</strong>
        <p>{{ copy('testingHint') }}</p>
      </div>
    </div>

    <div v-else-if="adaptation.stage.value === 'error'" class="adaptation-error" role="alert">
      <strong>{{ copy('couldNotAdapt') }}</strong>
      <p>{{ adaptation.error.value }}</p>
      <button type="button" @click="adaptation.reset">{{ copy('tryAgain') }}</button>
    </div>

    <div
      v-else-if="adaptation.draftRule.value && adaptation.selection.value"
      class="adaptation-review"
    >
      <div class="adaptation-review__source">
        <span>{{ adaptation.selection.value.domain }}</span>
        <strong>{{ adaptation.selection.value.element.tagName }}</strong>
        <p>{{ adaptation.selection.value.element.textPreview || copy('noPreview') }}</p>
      </div>

      <label class="adaptation-selector">
        <span>{{ copy('selector') }}</span>
        <select
          :value="adaptation.selectedCandidate.value?.selector"
          @change="chooseFromEvent"
        >
          <option
            v-for="candidate in adaptation.selection.value.candidates"
            :key="candidate.selector"
            :value="candidate.selector"
          >
            {{ candidateLabel(candidate) }}
          </option>
        </select>
      </label>

      <div
        v-if="adaptation.selection.value.kind === 'placement'"
        class="adaptation-position"
      >
        <span>{{ copy('position') }}</span>
        <div>
          <button
            type="button"
            :aria-pressed="adaptation.translationPosition.value === 'after'"
            @click="adaptation.setPosition('after')"
          >
            {{ copy('afterSource') }}
          </button>
          <button
            type="button"
            :aria-pressed="adaptation.translationPosition.value === 'before'"
            @click="adaptation.setPosition('before')"
          >
            {{ copy('beforeSource') }}
          </button>
        </div>
      </div>

      <div
        class="compatibility-strip"
        :data-status="adaptation.draftRule.value.compatibility?.status"
      >
        <div class="compatibility-strip__status">
          <span>{{ copy('compatibility') }}</span>
          <strong>
            {{ copy(adaptation.draftRule.value.compatibility?.status ?? 'warning') }}
          </strong>
        </div>
        <div>
          <span>{{ copy('roots') }}</span>
          <strong>
            {{ adaptation.draftRule.value.compatibility?.baseline.rootsSelected }}
            →
            {{ adaptation.draftRule.value.compatibility?.candidate.rootsSelected }}
          </strong>
        </div>
        <div>
          <span>{{ copy('blocks') }}</span>
          <strong>
            {{ adaptation.draftRule.value.compatibility?.baseline.collected }}
            →
            {{ adaptation.draftRule.value.compatibility?.candidate.collected }}
          </strong>
        </div>
        <div>
          <span>{{ copy('skipped') }}</span>
          <strong>
            {{ adaptation.draftRule.value.compatibility?.baseline.skipped }}
            →
            {{ adaptation.draftRule.value.compatibility?.candidate.skipped }}
          </strong>
        </div>
      </div>

      <ul
        v-if="adaptation.draftRule.value.compatibility?.warnings.length"
        class="adaptation-warnings"
      >
        <li
          v-for="warning in adaptation.draftRule.value.compatibility.warnings"
          :key="warning"
        >
          {{ warning }}
        </li>
      </ul>

      <div class="adaptation-review__actions">
        <button type="button" class="button-secondary" @click="adaptation.reset">
          {{ copy('cancel') }}
        </button>
        <button
          type="button"
          class="button-primary"
          :disabled="!adaptation.canSave.value"
          @click="saveDraft"
        >
          {{ copy('saveRule') }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.adaptation-studio {
  margin: 0 0 28px;
  border: 1px solid var(--lf-rule);
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--lf-accent) 8%, transparent) 1px, transparent 1px)
      0 0 / 28px 100%,
    var(--lf-paper);
}

.adaptation-studio__intro {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  padding: 22px;
  border-bottom: 1px solid var(--lf-rule);
}

.adaptation-studio__eyebrow {
  margin: 0 0 5px !important;
  color: var(--lf-accent) !important;
  font-size: 11px !important;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.adaptation-studio h3 {
  margin: 0 0 6px;
  font-family: var(--lf-font-serif);
  font-size: 21px;
}

.adaptation-studio p {
  margin: 0;
  color: var(--lf-ghost);
  font-size: 13px;
  line-height: 1.55;
}

.adaptation-studio__local {
  align-self: flex-start;
  white-space: nowrap;
  border: 1px solid var(--lf-rule);
  padding: 4px 7px;
  color: var(--lf-ghost);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.adaptation-actions {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
}

.adaptation-actions button {
  min-height: 104px;
  border: 0;
  border-right: 1px solid var(--lf-rule);
  padding: 18px;
  background: color-mix(in srgb, var(--lf-paper) 94%, transparent);
  color: var(--lf-ink);
  text-align: left;
  cursor: pointer;
}

.adaptation-actions button:last-child {
  border-right: 0;
}

.adaptation-actions button:hover,
.adaptation-actions button:focus-visible {
  outline: 0;
  background: var(--lf-margin);
  box-shadow: inset 0 -3px var(--lf-accent);
}

.adaptation-actions strong,
.adaptation-actions span {
  display: block;
}

.adaptation-actions strong {
  margin-bottom: 8px;
  font-size: 13px;
}

.adaptation-actions span {
  color: var(--lf-ghost);
  font-size: 11px;
  line-height: 1.45;
}

.adaptation-state,
.adaptation-error {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 22px;
}

.adaptation-state__pulse {
  width: 12px;
  height: 12px;
  border: 2px solid var(--lf-accent);
  border-radius: 50%;
  animation: selection-pulse 1.1s ease-in-out infinite;
}

@keyframes selection-pulse {
  50% { box-shadow: 0 0 0 7px color-mix(in srgb, var(--lf-accent) 16%, transparent); }
}

@media (prefers-reduced-motion: reduce) {
  .adaptation-state__pulse { animation: none; }
}

.adaptation-error {
  display: block;
}

.adaptation-error strong {
  color: var(--lf-danger-confirm);
}

.adaptation-error button {
  margin-top: 12px;
}

.adaptation-review {
  padding: 20px 22px 22px;
}

.adaptation-review__source {
  display: grid;
  grid-template-columns: auto auto 1fr;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 16px;
}

.adaptation-review__source span,
.adaptation-review__source strong {
  font-size: 11px;
}

.adaptation-review__source p {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.adaptation-selector,
.adaptation-position {
  display: block;
  margin-bottom: 16px;
}

.adaptation-selector > span,
.adaptation-position > span {
  display: block;
  margin-bottom: 7px;
  color: var(--lf-ghost);
  font-size: 11px;
  font-weight: 600;
}

.adaptation-selector select {
  width: 100%;
  height: 38px;
  border: 1px solid var(--lf-rule);
  border-radius: 0;
  padding: 0 10px;
  background: var(--lf-paper);
  color: var(--lf-ink);
  font: 12px var(--lf-font-sans);
}

.adaptation-position > div {
  display: grid;
  grid-template-columns: 1fr 1fr;
}

.adaptation-position button {
  height: 36px;
  border: 1px solid var(--lf-rule);
  background: var(--lf-paper);
  color: var(--lf-ghost);
}

.adaptation-position button + button {
  border-left: 0;
}

.adaptation-position button[aria-pressed="true"] {
  border-color: var(--lf-accent);
  background: var(--lf-accent);
  color: var(--lf-on-accent);
}

.compatibility-strip {
  display: grid;
  grid-template-columns: 1.4fr repeat(3, 1fr);
  border: 1px solid var(--lf-rule);
}

.compatibility-strip > div {
  padding: 11px 12px;
  border-right: 1px solid var(--lf-rule);
}

.compatibility-strip > div:last-child {
  border-right: 0;
}

.compatibility-strip span,
.compatibility-strip strong {
  display: block;
}

.compatibility-strip span {
  margin-bottom: 3px;
  color: var(--lf-ghost);
  font-size: 10px;
}

.compatibility-strip strong {
  font-size: 12px;
}

.compatibility-strip[data-status="compatible"] .compatibility-strip__status strong {
  color: var(--lf-success);
}

.compatibility-strip[data-status="warning"] .compatibility-strip__status strong,
.compatibility-strip[data-status="incompatible"] .compatibility-strip__status strong {
  color: var(--lf-accent);
}

.adaptation-warnings {
  margin: 12px 0 0;
  padding-left: 18px;
  color: var(--lf-ghost);
  font-size: 11px;
  line-height: 1.5;
}

.adaptation-review__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 18px;
}

.adaptation-review__actions button,
.adaptation-error button {
  height: 36px;
  border: 1px solid var(--lf-rule);
  padding: 0 15px;
  font-weight: 600;
  cursor: pointer;
}

.button-secondary,
.adaptation-error button {
  background: transparent;
  color: var(--lf-ghost);
}

.button-primary {
  border-color: var(--lf-accent) !important;
  background: var(--lf-accent);
  color: var(--lf-on-accent);
}

.button-primary:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

@media (max-width: 760px) {
  .adaptation-actions,
  .compatibility-strip {
    grid-template-columns: 1fr;
  }

  .adaptation-actions button,
  .compatibility-strip > div {
    border-right: 0;
    border-bottom: 1px solid var(--lf-rule);
  }

  .adaptation-actions button:last-child,
  .compatibility-strip > div:last-child {
    border-bottom: 0;
  }

  .adaptation-studio__intro {
    display: block;
  }

  .adaptation-studio__local {
    display: inline-block;
    margin-top: 12px;
  }
}
</style>

<script lang="ts">
const COPY = {
  en: {
    eyebrow: 'Site adaptation studio',
    title: 'Teach LingoFlow this page',
    description: 'Select directly on a webpage, then compare the collection result before saving a local rule.',
    localOnly: 'Stored locally',
    chooseMain: 'Choose reading area',
    chooseMainHint: 'Mark the page area that contains the main article or documentation.',
    chooseExclude: 'Choose what to skip',
    chooseExcludeHint: 'Keep navigation, comments, or other selected content untranslated.',
    choosePlacement: 'Choose translation position',
    choosePlacementHint: 'Apply a before/after preference when this reading area is present.',
    selecting: 'Select on the webpage',
    selectingHint: 'LingoFlow switched to your most recent webpage. Point to an area and click it; press Esc to cancel.',
    testing: 'Checking compatibility',
    testingHint: 'Comparing readable roots and blocks without contacting a translation provider.',
    couldNotAdapt: 'The page could not be adapted',
    tryAgain: 'Try again',
    noPreview: 'No text preview is available for this element.',
    selector: 'Selector candidate',
    position: 'Translation position',
    afterSource: 'Below source',
    beforeSource: 'Above source',
    compatibility: 'Compatibility',
    compatible: 'Compatible',
    warning: 'Review',
    incompatible: 'Incompatible',
    roots: 'Roots',
    blocks: 'Blocks',
    skipped: 'Skipped',
    cancel: 'Discard draft',
    saveRule: 'Save local rule',
  },
  'zh-Hans': {
    eyebrow: '站点适配工作台',
    title: '让 LingoFlow 学会这个页面',
    description: '直接在网页上选择区域，保存本地规则前先对比内容收集结果。',
    localOnly: '仅本地保存',
    chooseMain: '选择阅读区域',
    chooseMainHint: '标记正文、文章或文档所在的主要区域。',
    chooseExclude: '选择忽略区域',
    chooseExcludeHint: '让导航、评论或其他选中内容保持原文。',
    choosePlacement: '选择译文位置',
    choosePlacementHint: '当这个阅读区域存在时，应用译文在前或在后的偏好。',
    selecting: '请在网页上选择',
    selectingHint: 'LingoFlow 已切换到最近使用的网页。指向区域并单击；按 Esc 取消。',
    testing: '正在检查兼容性',
    testingHint: '无需调用翻译服务，正在对比可读根节点和文本块。',
    couldNotAdapt: '无法适配这个页面',
    tryAgain: '重试',
    noPreview: '这个元素没有可显示的文本预览。',
    selector: '选择器候选',
    position: '译文位置',
    afterSource: '原文下方',
    beforeSource: '原文上方',
    compatibility: '兼容性',
    compatible: '兼容',
    warning: '需要检查',
    incompatible: '不兼容',
    roots: '根节点',
    blocks: '文本块',
    skipped: '已跳过',
    cancel: '放弃草稿',
    saveRule: '保存本地规则',
  },
} as const
</script>
