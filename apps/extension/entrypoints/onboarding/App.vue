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
    welcomeTitle: 'Read the web in your language',
    welcomeBody: 'LingoFlow keeps the original page intact and places translations next to what you are reading. This short setup chooses your reading language and translation service.',
    privacy: 'Your configuration stays in browser storage. LingoFlow requests provider access only when the selected service needs it.',
    principleInline: 'Inline, not a popup',
    principleLocal: 'Local rules and terminology',
    principleChoice: 'Provider choice stays yours',
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
    welcomeTitle: '用你的语言阅读开放网页',
    welcomeBody: 'LingoFlow 会保留原网页，并把译文放在正在阅读的内容旁边。这个简短流程用于选择阅读语言和翻译服务。',
    privacy: '配置保存在浏览器本地。只有所选服务需要时，LingoFlow 才会请求对应来源的访问权限。',
    principleInline: '原文下方呈现，不弹窗',
    principleLocal: '规则与术语保存在本地',
    principleChoice: 'Provider 选择由你决定',
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
      <div class="brand-mark" aria-hidden="true">L<span>F</span></div>
      <div>
        <strong>{{ copy('brand') }}</strong>
        <span>{{ copy('progress') }}</span>
      </div>
      <button v-if="step !== 'complete'" type="button" class="skip-button" @click="skip">{{ copy('skip') }}</button>
    </header>

    <div v-if="loading" class="loading" aria-live="polite">Loading…</div>

    <div v-else class="onboarding-shell">
      <ol class="step-rail" :aria-label="copy('progress')">
        <li
          v-for="(item, index) in ONBOARDING_STEPS"
          :key="item"
          :data-active="item === step"
          :data-complete="index < stepIndex || step === 'complete'"
        >
          <span>{{ index + 1 }}</span>
          {{ stepLabel(item) }}
        </li>
      </ol>

      <section class="onboarding-card">
        <div v-if="message" class="onboarding-error" role="alert">{{ message }}</div>

        <template v-if="step === 'welcome'">
          <p class="eyebrow">Original + translation</p>
          <h1>{{ copy('welcomeTitle') }}</h1>
          <p class="lead">{{ copy('welcomeBody') }}</p>
          <div class="principle-grid">
            <div><strong>01</strong><span>{{ copy('principleInline') }}</span></div>
            <div><strong>02</strong><span>{{ copy('principleLocal') }}</span></div>
            <div><strong>03</strong><span>{{ copy('principleChoice') }}</span></div>
          </div>
          <p class="privacy-note">{{ copy('privacy') }}</p>
        </template>

        <template v-else-if="step === 'reading-language'">
          <p class="eyebrow">Reading policy</p>
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
          <p class="eyebrow">Translation service</p>
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
              <span>{{ choice.mark }}</span>
              <strong>{{ choice.name }}</strong>
              <small>{{ choice.body }}</small>
            </button>
          </div>
        </template>

        <template v-else-if="step === 'provider-configuration' || step === 'connection-test'">
          <p class="eyebrow">Provider contract</p>
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
          <p class="eyebrow">One minute to value</p>
          <h1>{{ copy('firstPageTitle') }}</h1>
          <p class="lead">{{ copy('firstPageBody') }}</p>
          <div class="guide-steps">
            <div><span>1</span><p>{{ copy('firstPageBody') }}</p></div>
            <div><span>2</span><p>{{ copy('hoverGuide') }}</p></div>
            <div><span>3</span><p>{{ copy('dynamicGuide') }}</p></div>
          </div>
        </template>

        <template v-else>
          <p class="eyebrow">Ready</p>
          <h1>{{ copy('completeTitle') }}</h1>
          <p class="lead">{{ copy('completeBody') }}</p>
          <div class="complete-mark" aria-hidden="true">✓</div>
        </template>

        <footer class="onboarding-footer">
          <lf-button
            v-if="canGoBack"
            variant="ghost"
            :label="copy('back')"
            :disabled="saving"
            @click="back"
          />
          <span v-else></span>
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
  --lf-paper: #fbfaf7;
  --lf-margin: #f2eee7;
  --lf-ink: #211e1a;
  --lf-muted: #746f67;
  --lf-whisper: #999188;
  --lf-rule: #dcd5ca;
  --lf-accent: #c7562e;
  --lf-success: #397651;
  --lf-danger: #a33a2b;
  --lf-font-serif: Georgia, 'Times New Roman', serif;
  --lf-font-sans: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif;
}

@media (prefers-color-scheme: dark) {
  :root {
    --lf-paper: #201e1b;
    --lf-margin: #292622;
    --lf-ink: #f2ede5;
    --lf-muted: #b8afa4;
    --lf-whisper: #938a80;
    --lf-rule: #49433c;
  }
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background:
    linear-gradient(90deg, transparent 0 79px, color-mix(in srgb, var(--lf-accent) 18%, transparent) 80px, transparent 81px),
    var(--lf-margin);
  color: var(--lf-ink);
  font-family: var(--lf-font-sans);
}

button {
  font: inherit;
}

.onboarding-page {
  width: min(1120px, calc(100% - 40px));
  min-height: 100vh;
  margin: 0 auto;
  padding: 28px 0 50px;
}

.onboarding-masthead {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 52px;
}

.brand-mark {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border: 1px solid var(--lf-ink);
  font-family: var(--lf-font-serif);
  font-size: 20px;
}

.brand-mark span {
  color: var(--lf-accent);
}

.onboarding-masthead strong,
.onboarding-masthead span {
  display: block;
}

.onboarding-masthead span {
  margin-top: 2px;
  color: var(--lf-muted);
  font-size: 12px;
}

.skip-button {
  margin-left: auto;
  border: 0;
  background: transparent;
  color: var(--lf-muted);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.onboarding-shell {
  display: grid;
  grid-template-columns: 190px minmax(0, 1fr);
  gap: 28px;
  margin-top: 34px;
}

.step-rail {
  margin: 0;
  padding: 6px 0;
  list-style: none;
}

.step-rail li {
  display: grid;
  grid-template-columns: 28px 1fr;
  align-items: center;
  gap: 9px;
  min-height: 48px;
  color: var(--lf-whisper);
  font-size: 12px;
}

.step-rail li span {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  border: 1px solid var(--lf-rule);
  border-radius: 50%;
}

.step-rail li[data-active="true"] {
  color: var(--lf-ink);
  font-weight: 700;
}

.step-rail li[data-active="true"] span {
  border-color: var(--lf-accent);
  background: var(--lf-accent);
  color: #fff;
}

.step-rail li[data-complete="true"] span {
  border-color: var(--lf-success);
  color: var(--lf-success);
}

.onboarding-card {
  min-height: 620px;
  padding: clamp(28px, 5vw, 58px);
  border: 1px solid var(--lf-rule);
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--lf-accent) 7%, transparent) 1px, transparent 1px) 0 0 / 32px 100%,
    var(--lf-paper);
  box-shadow: 0 18px 54px rgba(35, 29, 23, .08);
}

.eyebrow {
  margin: 0 0 12px;
  color: var(--lf-accent);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .14em;
  text-transform: uppercase;
}

h1 {
  max-width: 700px;
  margin: 0;
  font-family: var(--lf-font-serif);
  font-size: clamp(34px, 5vw, 58px);
  font-weight: 400;
  letter-spacing: -.035em;
  line-height: 1.02;
}

.lead {
  max-width: 680px;
  margin: 20px 0 30px;
  color: var(--lf-muted);
  font-size: 16px;
  line-height: 1.7;
}

.principle-grid,
.provider-choices {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.principle-grid div,
.provider-choices button {
  min-height: 130px;
  padding: 18px;
  border: 1px solid var(--lf-rule);
  background: color-mix(in srgb, var(--lf-paper) 93%, transparent);
}

.principle-grid strong,
.principle-grid span,
.provider-choices span,
.provider-choices strong,
.provider-choices small {
  display: block;
}

.principle-grid strong,
.provider-choices span {
  color: var(--lf-accent);
  font-family: var(--lf-font-serif);
  font-size: 22px;
}

.principle-grid span,
.provider-choices small {
  margin-top: 26px;
  color: var(--lf-muted);
  line-height: 1.45;
}

.privacy-note,
.connection-summary {
  margin-top: 24px;
  padding: 14px 16px;
  border-left: 3px solid var(--lf-accent);
  background: color-mix(in srgb, var(--lf-accent) 6%, var(--lf-paper));
  color: var(--lf-muted);
  line-height: 1.55;
}

.language-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
  max-width: 720px;
}

.provider-choices button {
  color: var(--lf-ink);
  cursor: pointer;
  text-align: left;
}

.provider-choices button[aria-pressed="true"] {
  border-color: var(--lf-accent);
  box-shadow: inset 0 -4px 0 var(--lf-accent);
}

.provider-choices strong {
  margin-top: 15px;
}

.provider-choices small {
  margin-top: 7px;
}

.connection-summary[data-success="true"] {
  border-color: var(--lf-success);
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
  padding: 16px 0;
  border-top: 1px solid var(--lf-rule);
}

.guide-steps span {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 1px solid var(--lf-accent);
  border-radius: 50%;
  color: var(--lf-accent);
}

.guide-steps p {
  margin: 3px 0 0;
  color: var(--lf-muted);
  line-height: 1.55;
}

.complete-mark {
  display: grid;
  width: 96px;
  height: 96px;
  margin-top: 54px;
  place-items: center;
  border: 1px solid var(--lf-success);
  border-radius: 50%;
  color: var(--lf-success);
  font-size: 44px;
}

.onboarding-footer {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 42px;
  padding-top: 22px;
  border-top: 1px solid var(--lf-rule);
}

.onboarding-error {
  margin-bottom: 20px;
  padding: 12px;
  border: 1px solid var(--lf-danger);
  color: var(--lf-danger);
}

.loading {
  padding: 80px;
  text-align: center;
}

button:focus-visible,
select:focus-visible {
  outline: 2px solid var(--lf-accent);
  outline-offset: 3px;
}

@media (max-width: 780px) {
  body {
    background: var(--lf-margin);
  }

  .onboarding-shell {
    grid-template-columns: 1fr;
  }

  .step-rail {
    display: flex;
    overflow-x: auto;
  }

  .step-rail li {
    min-width: 120px;
  }

  .principle-grid,
  .provider-choices,
  .language-grid {
    grid-template-columns: 1fr;
  }

  .onboarding-card {
    padding: 28px 22px;
  }
}

@media (prefers-reduced-motion: reduce) {
  * {
    scroll-behavior: auto !important;
  }
}
</style>
