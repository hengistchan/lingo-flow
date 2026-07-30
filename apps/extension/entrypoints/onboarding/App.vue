<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { DEFAULT_SETTINGS } from '@lingoflow/settings'
import {
  getLanguageLabel,
  getSourceLanguageOptions,
  getTargetLanguageOptions,
  resolveUiLocale,
  sendChromeMessage,
} from '@lingoflow/shared'
import type {
  AppSettings,
  OnboardingStep,
  ProviderConnectionResult,
  UiLocale,
} from '@lingoflow/types'
import ProviderConfiguration from '../../src/ui/ProviderConfiguration.vue'
import LfButton from '../../src/ui/LfButton.vue'
import LfFormField from '../../src/ui/LfFormField.vue'
import {
  adjacentOnboardingStep,
  beginOnboarding,
  ONBOARDING_STEPS,
  setOnboardingStep,
} from './onboarding-flow'

const settings = reactive<AppSettings>(cloneJson(DEFAULT_SETTINGS))
const loading = ref(true)
const saving = ref(false)
const message = ref('')
const connectionResult = ref<ProviderConnectionResult>()
const browserLocale = resolveUiLocale(globalThis.navigator?.language)
const sourceLanguages = getSourceLanguageOptions()
const targetLanguages = getTargetLanguageOptions()

const locale = computed<UiLocale>(() =>
  settings.interfaceLocale === 'auto' ? browserLocale : settings.interfaceLocale,
)
const step = computed(() => settings.onboarding.currentStep)
const stepIndex = computed(() =>
  step.value === 'complete' ? ONBOARDING_STEPS.length : ONBOARDING_STEPS.indexOf(step.value),
)
const canGoBack = computed(() => stepIndex.value > 0 && step.value !== 'complete')

onMounted(async () => {
  try {
    const loaded = await sendChromeMessage<AppSettings>({ type: 'settings/get' })
    Object.assign(settings, beginOnboarding(loaded))
  } catch (error) {
    message.value = error instanceof Error ? error.message : String(error)
  } finally {
    loading.value = false
  }
})

function copy(key: keyof typeof COPY.en): string {
  return COPY[locale.value][key]
}

function stepLabel(value: OnboardingStep): string {
  const key = `step_${value.replaceAll('-', '_')}` as keyof typeof COPY.en
  return copy(key)
}

async function next(): Promise<void> {
  const previous = cloneJson(settings)
  const nextStep = adjacentOnboardingStep(step.value, 1)
  Object.assign(settings, setOnboardingStep(settings, nextStep))
  if (!(await persist())) Object.assign(settings, previous)
}

async function back(): Promise<void> {
  const previousSettings = cloneJson(settings)
  const previous = adjacentOnboardingStep(step.value, -1)
  Object.assign(settings, setOnboardingStep(settings, previous))
  if (!(await persist())) Object.assign(settings, previousSettings)
}

async function skip(): Promise<void> {
  const previous = cloneJson(settings)
  Object.assign(settings, setOnboardingStep(settings, 'complete'))
  if (!(await persist())) Object.assign(settings, previous)
}

async function persist(): Promise<boolean> {
  saving.value = true
  message.value = ''
  try {
    await sendChromeMessage({
      type: 'settings/save',
      payload: { settings: cloneJson(settings) },
    })
    return true
  } catch (error) {
    message.value = error instanceof Error ? error.message : String(error)
    return false
  } finally {
    saving.value = false
  }
}

function updateSettings(value: AppSettings): void {
  Object.assign(settings, value)
  void persist()
}

function chooseProvider(id: string): void {
  settings.defaultProviderId = id
  connectionResult.value = undefined
  void persist()
}

function recordConnection(result: ProviderConnectionResult): void {
  connectionResult.value = result
}

async function openSettings(): Promise<void> {
  await chrome.runtime.openOptionsPage()
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

const COPY = {
  en: {
    brand: 'LingoFlow',
    progress: 'First-run setup',
    loading: 'Loading setup…',
    welcomeTitle: 'Read the web in your language',
    welcomeBody: 'LingoFlow keeps the original page intact and places translations next to what you are reading. This short setup chooses your reading language and translation service.',
    privacy: 'Your configuration stays in browser storage. LingoFlow requests provider access only when the selected service needs it.',
    principleInline: 'Inline, not a popup',
    principleLocal: 'Local rules and terminology',
    principleChoice: 'Provider choice stays yours',
    previewLabel: 'Inline translation preview',
    previewOriginalLabel: 'Original',
    previewTranslationLabel: 'Translation',
    previewOriginal: 'Good tools should disappear into the reading flow.',
    previewTranslation: '好的工具，应该融入阅读过程。',
    languageTitle: 'Choose your reading languages',
    languageBody: 'Automatic source detection works for most pages. Your target language controls page, hover, and dynamic translations.',
    target: 'Translate into',
    source: 'Source language',
    auto: 'Detect automatically',
    providerTitle: 'Choose how translations are generated',
    providerBody: 'Start immediately with the built-in free option, or connect a service you already trust.',
    googleName: 'Google Translate Free',
    googleBody: 'Fastest start · no key · experimental',
    openAIName: 'OpenAI-compatible',
    openAIBody: 'OpenAI, Ollama, LM Studio, and compatible APIs',
    azureName: 'Azure Translator',
    azureBody: 'Managed Translator resource with key and region',
    configureTitle: 'Configure the selected service',
    configureBody: 'The same provider controls are available later in Settings. Secrets remain in local extension storage.',
    connectionTitle: 'Verify the connection',
    connectionBody: 'Run the connection test below. If a local or private service is temporarily offline, you can continue and test again later.',
    connectionPassed: 'Connection verified. LingoFlow is ready to translate.',
    connectionPending: 'A successful test is recommended, but it is not required to finish setup.',
    firstPageTitle: 'Translate your first page',
    firstPageBody: 'Open an article or documentation page, select the LingoFlow toolbar icon, choose the target language, and press Translate page.',
    hoverGuide: 'For one sentence, point at it and press Alt+Shift+L. The translation appears directly below the source text.',
    dynamicGuide: 'Keep dynamic translation enabled for infinite scroll and single-page apps; newly added readable content is translated once.',
    completeTitle: 'Your reading layer is ready',
    completeBody: 'You can change providers, terminology, site rules, and reading languages at any time.',
    back: 'Back',
    continue: 'Continue',
    finish: 'Finish setup',
    skip: 'Skip setup',
    openSettings: 'Open settings',
    step_welcome: 'Welcome',
    step_reading_language: 'Languages',
    step_provider_choice: 'Provider',
    step_provider_configuration: 'Configuration',
    step_connection_test: 'Connection',
    step_first_page_guide: 'First page',
    step_complete: 'Complete',
  },
  'zh-Hans': {
    brand: 'LingoFlow',
    progress: '首次使用设置',
    loading: '正在加载设置…',
    welcomeTitle: '用你的语言阅读开放网页',
    welcomeBody: 'LingoFlow 会保留原网页，并把译文放在正在阅读的内容旁边。这个简短流程用于选择阅读语言和翻译服务。',
    privacy: '配置保存在浏览器本地。只有所选服务需要时，LingoFlow 才会请求对应来源的访问权限。',
    principleInline: '原文下方呈现，不弹窗',
    principleLocal: '规则与术语保存在本地',
    principleChoice: 'Provider 选择由你决定',
    previewLabel: '行内翻译预览',
    previewOriginalLabel: '原文',
    previewTranslationLabel: '译文',
    previewOriginal: 'Good tools should disappear into the reading flow.',
    previewTranslation: '好的工具，应该融入阅读过程。',
    languageTitle: '选择阅读语言',
    languageBody: '自动识别适用于大多数网页。目标语言会同时用于整页、指针句子和动态内容翻译。',
    target: '翻译为',
    source: '原文语言',
    auto: '自动识别',
    providerTitle: '选择译文生成方式',
    providerBody: '可直接使用内置免费选项，也可以连接你已经信任的服务。',
    googleName: 'Google Translate Free',
    googleBody: '最快开始 · 无需密钥 · 实验性',
    openAIName: 'OpenAI 兼容',
    openAIBody: '支持 OpenAI、Ollama、LM Studio 及兼容 API',
    azureName: 'Azure Translator',
    azureBody: '使用密钥和区域的托管 Translator 资源',
    configureTitle: '配置所选服务',
    configureBody: '以后仍可在设置中使用同一套 Provider 控件；密钥只保存在扩展本地存储。',
    connectionTitle: '验证连接',
    connectionBody: '请运行下面的连接测试。如果本地或私有服务暂时离线，也可以先完成设置，稍后重试。',
    connectionPassed: '连接验证成功，LingoFlow 已可翻译。',
    connectionPending: '建议完成连接测试，但它不会阻止你完成首次设置。',
    firstPageTitle: '翻译第一个页面',
    firstPageBody: '打开文章或文档页面，点击工具栏中的 LingoFlow，选择目标语言，然后按“翻译页面”。',
    hoverGuide: '只翻译一句话时，把指针移到句子上并按 Alt+Shift+L；译文会直接出现在原文下方。',
    dynamicGuide: '无限滚动和单页应用可保持动态翻译开启；新增的可读内容只会翻译一次。',
    completeTitle: '阅读层已经准备好',
    completeBody: 'Provider、术语、站点规则和阅读语言都可以随时调整。',
    back: '返回',
    continue: '继续',
    finish: '完成设置',
    skip: '跳过设置',
    openSettings: '打开设置',
    step_welcome: '欢迎',
    step_reading_language: '语言',
    step_provider_choice: 'Provider',
    step_provider_configuration: '配置',
    step_connection_test: '连接',
    step_first_page_guide: '第一个页面',
    step_complete: '完成',
  },
} as const
</script>

<template>
  <main class="onboarding-page">
    <header class="onboarding-masthead">
      <div class="brand-mark" aria-hidden="true">
        <span></span>
        <span></span>
      </div>
      <div class="brand-copy">
        <strong>{{ copy('brand') }}</strong>
        <span>{{ copy('progress') }}</span>
      </div>
      <button v-if="step !== 'complete'" type="button" class="skip-button" @click="skip">{{ copy('skip') }}</button>
    </header>

    <div v-if="loading" class="loading" aria-live="polite">{{ copy('loading') }}</div>

    <div v-else class="onboarding-shell">
      <ol class="step-rail" :aria-label="copy('progress')">
        <li
          v-for="(item, index) in ONBOARDING_STEPS"
          :key="item"
          :data-active="item === step"
          :data-complete="index < stepIndex || step === 'complete'"
        >
          <span class="step-index">{{ index < stepIndex || step === 'complete' ? '✓' : index + 1 }}</span>
          <span class="step-label">{{ stepLabel(item) }}</span>
        </li>
      </ol>

      <section class="onboarding-card">
        <div :key="step" class="onboarding-content">
          <div v-if="message" class="onboarding-error" role="alert">{{ message }}</div>

          <template v-if="step === 'welcome'">
            <div class="welcome-layout">
              <div class="welcome-copy">
                <p class="eyebrow">{{ stepLabel(step) }}</p>
                <h1>{{ copy('welcomeTitle') }}</h1>
                <p class="lead">{{ copy('welcomeBody') }}</p>
                <div class="principle-list">
                  <div><span aria-hidden="true">✓</span>{{ copy('principleInline') }}</div>
                  <div><span aria-hidden="true">✓</span>{{ copy('principleLocal') }}</div>
                  <div><span aria-hidden="true">✓</span>{{ copy('principleChoice') }}</div>
                </div>
                <p class="privacy-note">{{ copy('privacy') }}</p>
              </div>

              <aside class="reading-preview" :aria-label="copy('previewLabel')">
                <div class="preview-toolbar" aria-hidden="true">
                  <span></span><span></span><span></span>
                  <i>article.example</i>
                </div>
                <div class="preview-body">
                  <span class="preview-label">{{ copy('previewOriginalLabel') }}</span>
                  <p class="preview-original">{{ copy('previewOriginal') }}</p>
                  <div class="preview-translation">
                    <span class="preview-label">{{ copy('previewTranslationLabel') }}</span>
                    <p>{{ copy('previewTranslation') }}</p>
                  </div>
                </div>
              </aside>
            </div>
          </template>

          <template v-else-if="step === 'reading-language'">
            <p class="eyebrow">{{ stepLabel(step) }}</p>
            <h1>{{ copy('languageTitle') }}</h1>
            <p class="lead">{{ copy('languageBody') }}</p>
            <div class="language-grid">
              <lf-form-field
                :label="copy('target')"
                type="select"
                :model-value="settings.targetLang"
                :options="targetLanguages.map(item => ({ value: item.code, label: getLanguageLabel(item.code, locale) }))"
                @update:model-value="settings.targetLang = String($event); persist()"
              />
              <lf-form-field
                :label="copy('source')"
                type="select"
                :model-value="settings.sourceLang"
                :options="sourceLanguages.map(item => ({ value: item.code, label: item.code === 'auto' ? copy('auto') : getLanguageLabel(item.code, locale) }))"
                @update:model-value="settings.sourceLang = String($event); persist()"
              />
            </div>
          </template>

          <template v-else-if="step === 'provider-choice'">
            <p class="eyebrow">{{ stepLabel(step) }}</p>
            <h1>{{ copy('providerTitle') }}</h1>
            <p class="lead">{{ copy('providerBody') }}</p>
            <div class="provider-choices">
              <button
                v-for="choice in [
                  { id: 'google-free-translate', name: copy('googleName'), body: copy('googleBody'), mark: 'G' },
                  { id: 'openai-compatible', name: copy('openAIName'), body: copy('openAIBody'), mark: 'AI' },
                  { id: 'azure-translator', name: copy('azureName'), body: copy('azureBody'), mark: 'Az' },
                ]"
                :key="choice.id"
                type="button"
                :aria-pressed="settings.defaultProviderId === choice.id"
                @click="chooseProvider(choice.id)"
              >
                <span class="provider-mark">{{ choice.mark }}</span>
                <strong>{{ choice.name }}</strong>
                <small>{{ choice.body }}</small>
                <span class="provider-selected" aria-hidden="true">✓</span>
              </button>
            </div>
          </template>

          <template v-else-if="step === 'provider-configuration' || step === 'connection-test'">
            <p class="eyebrow">{{ stepLabel(step) }}</p>
            <h1>{{ step === 'connection-test' ? copy('connectionTitle') : copy('configureTitle') }}</h1>
            <p class="lead">
              {{ step === 'connection-test' ? copy('connectionBody') : copy('configureBody') }}
            </p>
            <p
              v-if="step === 'connection-test'"
              class="connection-summary"
              :data-success="connectionResult?.ok"
            >
              {{ connectionResult?.ok ? copy('connectionPassed') : copy('connectionPending') }}
            </p>
            <provider-configuration
              :model-value="settings"
              :locale="locale"
              :show-fallback="false"
              :show-performance="false"
              @update:model-value="updateSettings"
              @connection-tested="recordConnection"
            />
          </template>

          <template v-else-if="step === 'first-page-guide'">
            <p class="eyebrow">{{ stepLabel(step) }}</p>
            <h1>{{ copy('firstPageTitle') }}</h1>
            <p class="lead">{{ copy('firstPageBody') }}</p>
            <div class="guide-steps">
              <div><span>1</span><p>{{ copy('firstPageBody') }}</p></div>
              <div><span>2</span><p>{{ copy('hoverGuide') }}</p></div>
              <div><span>3</span><p>{{ copy('dynamicGuide') }}</p></div>
            </div>
          </template>

          <template v-else>
            <p class="eyebrow">{{ stepLabel(step) }}</p>
            <h1>{{ copy('completeTitle') }}</h1>
            <p class="lead">{{ copy('completeBody') }}</p>
            <div class="complete-mark" aria-hidden="true">✓</div>
          </template>
        </div>

        <footer class="onboarding-footer">
          <lf-button
            v-if="canGoBack"
            variant="ghost"
            :label="copy('back')"
            :disabled="saving"
            @click="back"
          />
          <lf-button
            v-if="step !== 'complete'"
            variant="primary"
            :label="step === 'first-page-guide' ? copy('finish') : copy('continue')"
            :disabled="saving"
            @click="next"
          />
          <lf-button
            v-else
            variant="primary"
            :label="copy('openSettings')"
            @click="openSettings"
          />
        </footer>
      </section>
    </div>
  </main>
</template>

<style>
:root {
  color-scheme: light dark;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background:
    radial-gradient(circle at 12% -10%, color-mix(in srgb, var(--lf-accent) 12%, transparent), transparent 34%),
    var(--lf-margin);
  color: var(--lf-ink);
  font-family: var(--lf-font-sans);
}

button {
  font: inherit;
}

.onboarding-page {
  width: min(1000px, calc(100% - 48px));
  min-height: 100vh;
  margin: 0 auto;
  padding: 24px 0 56px;
}

.onboarding-masthead {
  display: flex;
  align-items: center;
  gap: 11px;
  min-height: 44px;
}

.brand-mark {
  position: relative;
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  border: 1px solid color-mix(in srgb, var(--lf-accent) 18%, var(--lf-rule));
  border-radius: 12px;
  background: var(--lf-accent-soft);
}

.brand-mark span {
  position: absolute;
  width: 14px;
  height: 18px;
  border: 2px solid var(--lf-accent);
  border-radius: 3px;
  background: var(--lf-paper);
}

.brand-mark span:first-child {
  top: 9px;
  left: 10px;
}

.brand-mark span:last-child {
  right: 9px;
  bottom: 8px;
  background: var(--lf-accent);
}

.brand-copy strong,
.brand-copy span {
  display: block;
}

.brand-copy strong {
  font-size: 14px;
  letter-spacing: -.01em;
}

.brand-copy span {
  margin-top: 2px;
  color: var(--lf-muted);
  font-size: 11px;
}

.skip-button {
  margin-left: auto;
  min-height: 36px;
  border: 1px solid transparent;
  border-radius: var(--lf-radius-sm);
  padding: 0 12px;
  background: transparent;
  color: var(--lf-muted);
  cursor: pointer;
  font-size: 12px;
  transition: background .15s ease, color .15s ease;
}

.skip-button:hover {
  background: color-mix(in srgb, var(--lf-accent) 7%, transparent);
  color: var(--lf-ink);
}

.onboarding-shell {
  margin-top: 28px;
}

.step-rail {
  position: relative;
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  width: min(880px, 100%);
  margin: 0 auto 18px;
  padding: 0 22px;
  list-style: none;
}

.step-rail::before {
  position: absolute;
  top: 16px;
  right: calc(8.333% + 22px);
  left: calc(8.333% + 22px);
  height: 1px;
  background: var(--lf-rule);
  content: '';
}

.step-rail li {
  position: relative;
  z-index: 1;
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  color: var(--lf-whisper);
  font-size: 11px;
  text-align: center;
}

.step-index {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: 1px solid var(--lf-rule);
  border-radius: 50%;
  background: var(--lf-margin);
  color: var(--lf-whisper);
  font-size: 11px;
  font-weight: 700;
  transition: border-color .15s ease, background .15s ease, color .15s ease;
}

.step-label {
  overflow: hidden;
  max-width: 100%;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.step-rail li[data-active="true"] {
  color: var(--lf-accent);
  font-weight: 700;
}

.step-rail li[data-active="true"] .step-index {
  border-color: var(--lf-accent);
  background: var(--lf-accent);
  color: var(--lf-on-accent);
  box-shadow: 0 0 0 5px color-mix(in srgb, var(--lf-accent) 10%, transparent);
}

.step-rail li[data-complete="true"] .step-index {
  border-color: color-mix(in srgb, var(--lf-success) 55%, var(--lf-rule));
  background: color-mix(in srgb, var(--lf-success) 10%, var(--lf-margin));
  color: var(--lf-success);
}

.onboarding-card {
  min-height: 520px;
  padding: clamp(30px, 5vw, 52px);
  border: 1px solid var(--lf-rule);
  border-radius: 18px;
  background: var(--lf-paper);
  box-shadow: var(--lf-shadow-soft);
}

.onboarding-content {
  min-height: 350px;
  animation: step-enter .18s ease-out both;
}

@keyframes step-enter {
  from {
    opacity: 0;
    transform: translateY(6px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  margin: 0 0 14px;
  border-radius: 999px;
  padding: 0 10px;
  background: var(--lf-accent-soft);
  color: var(--lf-accent);
  font-size: 11px;
  font-weight: 700;
}

h1 {
  max-width: 680px;
  margin: 0;
  font-size: clamp(30px, 4vw, 40px);
  font-weight: 680;
  letter-spacing: -.04em;
  line-height: 1.15;
}

.lead {
  max-width: 680px;
  margin: 16px 0 28px;
  color: var(--lf-muted);
  font-size: 15px;
  line-height: 1.65;
}

.welcome-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.12fr) minmax(280px, .88fr);
  align-items: center;
  gap: clamp(32px, 5vw, 52px);
}

.principle-list {
  display: grid;
  gap: 10px;
}

.principle-list div {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--lf-ghost);
  font-size: 13px;
}

.principle-list span {
  display: grid;
  width: 22px;
  height: 22px;
  flex: 0 0 22px;
  place-items: center;
  border-radius: 50%;
  background: var(--lf-accent-soft);
  color: var(--lf-accent);
  font-size: 11px;
  font-weight: 800;
}

.reading-preview {
  overflow: hidden;
  border: 1px solid var(--lf-rule);
  border-radius: var(--lf-radius-lg);
  background: color-mix(in srgb, var(--lf-paper) 96%, var(--lf-margin));
  box-shadow: 0 18px 36px rgb(23 32 51 / 10%);
  transform: rotate(1deg);
}

.preview-toolbar {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 38px;
  border-bottom: 1px solid var(--lf-rule);
  padding: 0 13px;
  background: color-mix(in srgb, var(--lf-margin) 65%, var(--lf-paper));
}

.preview-toolbar span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--lf-rule);
}

.preview-toolbar span:first-child {
  background: color-mix(in srgb, var(--lf-danger) 68%, var(--lf-rule));
}

.preview-toolbar span:nth-child(2) {
  background: color-mix(in srgb, #d6a31f 70%, var(--lf-rule));
}

.preview-toolbar span:nth-child(3) {
  background: color-mix(in srgb, var(--lf-success) 68%, var(--lf-rule));
}

.preview-toolbar i {
  overflow: hidden;
  margin-left: 8px;
  color: var(--lf-whisper);
  font-size: 10px;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-body {
  padding: 24px 24px 26px;
}

.preview-label {
  display: block;
  color: var(--lf-whisper);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: .1em;
  text-transform: uppercase;
}

.preview-original {
  margin: 8px 0 18px;
  color: var(--lf-ink);
  font-family: var(--lf-font-serif);
  font-size: 18px;
  line-height: 1.6;
}

.preview-translation {
  border-left: 2px solid var(--lf-accent);
  border-radius: 0 var(--lf-radius) var(--lf-radius) 0;
  padding: 13px 14px;
  background: var(--lf-accent-soft);
}

.preview-translation .preview-label {
  color: var(--lf-accent);
}

.preview-translation p {
  margin: 7px 0 0;
  color: var(--lf-ink);
  font-size: 15px;
  font-weight: 560;
  line-height: 1.55;
}

.privacy-note,
.connection-summary {
  margin: 22px 0 0;
  border: 1px solid color-mix(in srgb, var(--lf-accent) 12%, var(--lf-rule));
  border-radius: var(--lf-radius);
  padding: 12px 14px;
  background: color-mix(in srgb, var(--lf-accent) 4%, var(--lf-paper));
  color: var(--lf-muted);
  font-size: 12px;
  line-height: 1.6;
}

.language-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
  max-width: 680px;
}

.provider-choices {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.provider-choices button {
  position: relative;
  min-height: 168px;
  border: 1px solid var(--lf-rule);
  border-radius: 13px;
  padding: 18px;
  background: color-mix(in srgb, var(--lf-paper) 96%, var(--lf-margin));
  color: var(--lf-ink);
  cursor: pointer;
  text-align: left;
  transition:
    transform .15s ease,
    border-color .15s ease,
    background .15s ease,
    box-shadow .15s ease;
}

.provider-choices button:hover {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--lf-accent) 35%, var(--lf-rule));
  box-shadow: 0 10px 24px rgb(23 32 51 / 7%);
}

.provider-choices button[aria-pressed="true"] {
  border-color: var(--lf-accent);
  background: color-mix(in srgb, var(--lf-accent) 6%, var(--lf-paper));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--lf-accent) 10%, transparent);
}

.provider-choices strong,
.provider-choices small {
  display: block;
}

.provider-mark {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 11px;
  background: var(--lf-accent-soft);
  color: var(--lf-accent);
  font-size: 13px;
  font-weight: 800;
}

.provider-choices strong {
  margin-top: 18px;
  font-size: 14px;
  line-height: 1.35;
}

.provider-choices small {
  margin-top: 8px;
  color: var(--lf-muted);
  font-size: 11px;
  line-height: 1.5;
}

.provider-selected {
  position: absolute;
  top: 14px;
  right: 14px;
  display: grid;
  width: 20px;
  height: 20px;
  place-items: center;
  border-radius: 50%;
  background: var(--lf-accent);
  color: var(--lf-on-accent);
  font-size: 11px;
  font-weight: 800;
  opacity: 0;
  transform: scale(.8);
  transition: opacity .15s ease, transform .15s ease;
}

.provider-choices button[aria-pressed="true"] .provider-selected {
  opacity: 1;
  transform: scale(1);
}

.connection-summary[data-success="true"] {
  border-color: color-mix(in srgb, var(--lf-success) 50%, var(--lf-rule));
  background: color-mix(in srgb, var(--lf-success) 6%, var(--lf-paper));
}

.guide-steps {
  display: grid;
  gap: 12px;
}

.guide-steps div {
  display: grid;
  grid-template-columns: 36px 1fr;
  align-items: start;
  gap: 14px;
  border: 1px solid var(--lf-rule);
  border-radius: 12px;
  padding: 15px 16px;
  background: color-mix(in srgb, var(--lf-margin) 48%, var(--lf-paper));
}

.guide-steps span {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 50%;
  background: var(--lf-accent-soft);
  color: var(--lf-accent);
  font-size: 12px;
  font-weight: 800;
}

.guide-steps p {
  margin: 3px 0 0;
  color: var(--lf-muted);
  line-height: 1.55;
}

.complete-mark {
  display: grid;
  width: 84px;
  height: 84px;
  margin-top: 42px;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--lf-success) 30%, var(--lf-rule));
  border-radius: 50%;
  background: color-mix(in srgb, var(--lf-success) 8%, var(--lf-paper));
  color: var(--lf-success);
  font-size: 34px;
}

.onboarding-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 32px;
  padding-top: 20px;
  border-top: 1px solid var(--lf-rule);
}

.onboarding-footer .lf-btn--ghost {
  margin-right: auto;
}

.onboarding-error {
  margin-bottom: 20px;
  border: 1px solid color-mix(in srgb, var(--lf-danger) 48%, var(--lf-rule));
  border-radius: var(--lf-radius);
  padding: 12px 14px;
  background: color-mix(in srgb, var(--lf-danger) 6%, var(--lf-paper));
  color: var(--lf-danger);
  font-size: 12px;
  line-height: 1.5;
}

.loading {
  margin-top: 64px;
  border: 1px solid var(--lf-rule);
  border-radius: var(--lf-radius-lg);
  padding: 80px 24px;
  background: var(--lf-paper);
  color: var(--lf-muted);
  text-align: center;
  box-shadow: var(--lf-shadow-soft);
}

button:focus-visible,
select:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--lf-accent) 25%, transparent);
  outline-offset: 2px;
}

@media (max-width: 800px) {
  .welcome-layout {
    grid-template-columns: 1fr;
  }

  .reading-preview {
    width: min(480px, 100%);
    transform: none;
  }

  .provider-choices {
    grid-template-columns: 1fr;
  }

  .provider-choices button {
    min-height: 128px;
  }
}

@media (max-width: 640px) {
  .onboarding-page {
    width: min(100% - 28px, 1000px);
    padding-top: 16px;
  }

  .brand-copy span {
    display: none;
  }

  .onboarding-shell {
    margin-top: 22px;
  }

  .step-rail {
    margin-bottom: 14px;
    padding: 0 0 22px;
  }

  .step-rail::before {
    right: 8.333%;
    left: 8.333%;
  }

  .step-label {
    display: none;
  }

  .step-rail li[data-active="true"] .step-label {
    position: absolute;
    top: 40px;
    left: 50%;
    display: block;
    overflow: visible;
    max-width: 90px;
    transform: translateX(-50%);
  }

  .onboarding-card {
    min-height: 0;
    border-radius: 15px;
    padding: 28px 22px;
  }

  .onboarding-content {
    min-height: 0;
  }

  h1 {
    font-size: clamp(28px, 9vw, 34px);
  }

  .lead {
    margin-bottom: 24px;
    font-size: 14px;
  }

  .language-grid {
    grid-template-columns: 1fr;
  }

  .onboarding-footer {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
  }

  .onboarding-footer .lf-btn--ghost {
    margin-right: 0;
  }

  .onboarding-footer .lf-btn--primary {
    width: 100%;
  }

  .onboarding-footer .lf-btn--primary:only-child {
    grid-column: 1 / -1;
  }
}

@media (prefers-reduced-motion: reduce) {
  * {
    scroll-behavior: auto !important;
    transition: none !important;
    animation: none !important;
  }

  .provider-choices button:hover,
  .provider-selected,
  .provider-choices button[aria-pressed="true"] .provider-selected {
    transform: none;
  }
}
</style>
