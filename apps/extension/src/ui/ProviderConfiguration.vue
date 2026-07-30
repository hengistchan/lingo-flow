<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { BUILT_IN_PRESETS, isProviderConfigured } from '@lingoflow/providers'
import { sendChromeMessage, t } from '@lingoflow/shared'
import type {
  AppSettings,
  ProviderConnectionMessageCode,
  ProviderConnectionResult,
  UiLocale,
} from '@lingoflow/types'
import { getProviderEndpoint, hasRuntimeApi, requestProviderOriginAccess } from '../provider-access'
import LfButton from './LfButton.vue'
import LfFormField from './LfFormField.vue'
import { advanceDestructiveConfirmation } from './destructive-confirmation'

const props = withDefaults(defineProps<{
  modelValue: AppSettings
  locale: UiLocale
  showFallback?: boolean
  showPerformance?: boolean
}>(), {
  showFallback: true,
  showPerformance: true,
})

const emit = defineEmits<{
  'update:modelValue': [settings: AppSettings]
  'connection-tested': [result: ProviderConnectionResult]
}>()

const testingConnection = ref(false)
const connectionResult = ref<ProviderConnectionResult>()
const showAddProviderMenu = ref(false)
const showCustomProviderForm = ref(false)
const customProviderName = ref('')
const customProviderBaseUrl = ref('')
const customProviderApiKey = ref('')
const customProviderModel = ref('')
const pendingRemoveProviderId = ref<string | null>(null)
let removeProviderConfirmationTimer: ReturnType<typeof setTimeout> | undefined
const reasoningEffortOptions = ['auto', 'none', 'minimal', 'low', 'medium', 'high'] as const

const activeProvider = computed(() =>
  props.modelValue.providers[props.modelValue.defaultProviderId],
)
const activePreset = computed(() =>
  BUILT_IN_PRESETS.find(item => item.id === activeProvider.value?.presetId),
)
const activeProviderFields = computed(() => activePreset.value?.fields ?? [])
const selectedProviderConfigured = computed(() =>
  activeProvider.value ? isProviderConfigured(activeProvider.value) : false,
)
const isOpenAICompatibleProvider = computed(() =>
  activeProvider.value?.presetId === 'openai-compatible',
)
const availablePresets = computed(() =>
  BUILT_IN_PRESETS.filter(preset => !(preset.id in props.modelValue.providers)),
)
const fallbackProviderOptions = computed(() => [
  { value: '', label: copy('options.none') },
  ...Object.entries(props.modelValue.providers)
    .filter(([id]) => id !== props.modelValue.defaultProviderId)
    .map(([id, config]) => ({ value: id, label: config.name })),
])
const connectionMessage = computed(() =>
  connectionResult.value ? copy(connectionCopyKey(connectionResult.value.messageCode)) : '',
)
const providerGuide = computed(() => {
  const presetId = activeProvider.value?.presetId
  if (presetId === 'google-free-translate') return localCopy('googleGuide')
  if (presetId === 'azure-translator') return localCopy('azureGuide')
  return localCopy('openAIGuide')
})

watch(() => props.modelValue.defaultProviderId, () => {
  connectionResult.value = undefined
  pendingRemoveProviderId.value = null
})

onUnmounted(() => {
  if (removeProviderConfirmationTimer) clearTimeout(removeProviderConfirmationTimer)
})

function copy(key: Parameters<typeof t>[1]): string {
  return t(props.locale, key)
}

function localCopy(key: keyof typeof LOCAL_COPY.en): string {
  return LOCAL_COPY[props.locale][key]
}

function commit(update: (settings: AppSettings) => void): void {
  const settings = cloneJson(props.modelValue)
  update(settings)
  if (settings.fallbackProviderId === settings.defaultProviderId) {
    settings.fallbackProviderId = ''
  }
  emit('update:modelValue', settings)
  connectionResult.value = undefined
}

function setDefaultProvider(id: string): void {
  commit(settings => {
    settings.defaultProviderId = id
  })
}

function updateProviderValue(key: string, value: string): void {
  commit(settings => {
    settings.providers[settings.defaultProviderId].values[key] = value
  })
}

function addProvider(presetId: string): void {
  const preset = BUILT_IN_PRESETS.find(item => item.id === presetId)
  if (!preset) return
  const defaultValues: Record<string, string> = {}
  for (const field of preset.fields) {
    if (field.defaultValue) defaultValues[field.key] = field.defaultValue
  }
  if (presetId === 'openai-compatible') {
    defaultValues.reasoningEffort = 'auto'
    defaultValues.disableThinking = 'false'
  }
  commit(settings => {
    settings.providers[presetId] = {
      id: presetId,
      presetId,
      name: preset.name,
      values: defaultValues,
    }
    settings.defaultProviderId = presetId
  })
  showAddProviderMenu.value = false
}

function removeProvider(id: string): void {
  if (Object.keys(props.modelValue.providers).length <= 1) return
  commit(settings => {
    delete settings.providers[id]
    if (settings.defaultProviderId === id) {
      settings.defaultProviderId = Object.keys(settings.providers)[0] ?? ''
    }
    if (settings.fallbackProviderId === id) settings.fallbackProviderId = ''
  })
}

function requestRemoveProvider(id: string): void {
  const next = advanceDestructiveConfirmation(pendingRemoveProviderId.value, id)
  pendingRemoveProviderId.value = next.pendingId
  if (removeProviderConfirmationTimer) clearTimeout(removeProviderConfirmationTimer)

  if (next.confirmed) {
    removeProvider(id)
    return
  }

  removeProviderConfirmationTimer = setTimeout(() => {
    if (pendingRemoveProviderId.value === id) pendingRemoveProviderId.value = null
  }, 5000)
}

function openCustomProviderForm(): void {
  showAddProviderMenu.value = false
  showCustomProviderForm.value = true
  customProviderName.value = ''
  customProviderBaseUrl.value = 'http://localhost:11434/v1'
  customProviderApiKey.value = ''
  customProviderModel.value = 'gpt-4o-mini'
}

function confirmCustomProvider(): void {
  const name = customProviderName.value.trim()
  const baseUrl = customProviderBaseUrl.value.trim()
  const model = customProviderModel.value.trim()
  if (!name || !baseUrl || !model) return
  const id = `custom-${Date.now()}`
  commit(settings => {
    settings.providers[id] = {
      id,
      presetId: 'openai-compatible',
      name,
      values: {
        baseUrl,
        apiKey: customProviderApiKey.value.trim(),
        model,
        reasoningEffort: 'auto',
        disableThinking: 'false',
      },
    }
    settings.defaultProviderId = id
  })
  showCustomProviderForm.value = false
}

async function testConnection(): Promise<void> {
  const provider = activeProvider.value
  if (!provider) return
  testingConnection.value = true
  connectionResult.value = undefined
  try {
    if (!hasRuntimeApi()) {
      connectionResult.value = {
        ok: false,
        providerId: provider.id,
        messageCode: 'config_incomplete',
      }
    } else if (!(await requestProviderOriginAccess(getProviderEndpoint(provider)))) {
      connectionResult.value = {
        ok: false,
        providerId: provider.id,
        messageCode: 'permission_denied',
      }
    } else {
      connectionResult.value = await sendChromeMessage<ProviderConnectionResult>({
        type: 'provider/testConnection',
        payload: { providerId: provider.id, config: cloneJson(provider) },
      })
    }
  } catch {
    connectionResult.value = {
      ok: false,
      providerId: provider.id,
      messageCode: 'provider_failed',
    }
  } finally {
    testingConnection.value = false
    if (connectionResult.value) emit('connection-tested', connectionResult.value)
  }
}

function connectionCopyKey(code: ProviderConnectionMessageCode): Parameters<typeof t>[1] {
  const keys: Record<ProviderConnectionMessageCode, Parameters<typeof t>[1]> = {
    connection_ok: 'options.connectionOk',
    config_incomplete: 'options.connectionConfigIncomplete',
    authentication_failed: 'options.connectionAuthenticationFailed',
    network_failed: 'options.connectionNetworkFailed',
    permission_denied: 'options.connectionPermissionDenied',
    provider_failed: 'options.connectionProviderFailed',
  }
  return keys[code]
}

function reasoningEffortCopyKey(
  effort: typeof reasoningEffortOptions[number],
): Parameters<typeof t>[1] {
  const keys: Record<typeof reasoningEffortOptions[number], Parameters<typeof t>[1]> = {
    auto: 'options.reasoningAuto',
    none: 'options.reasoningNone',
    minimal: 'options.reasoningMinimal',
    low: 'options.reasoningLow',
    medium: 'options.reasoningMedium',
    high: 'options.reasoningHigh',
  }
  return keys[effort]
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

const LOCAL_COPY = {
  en: {
    guide: 'Before you connect',
    googleGuide: 'Ready immediately. No API key or extra website permission is required. Four concurrent batches tested fastest; LingoFlow caps Google requests at 40 across tabs. Use a dedicated service when privacy, reliability, or terminology control is critical.',
    azureGuide: 'Enter the Translator endpoint, subscription key, and resource region. LingoFlow asks for access only to the endpoint origin you configure.',
    openAIGuide: 'Works with OpenAI and compatible servers such as Ollama or LM Studio. Confirm the Base URL includes /v1, choose a model that supports chat completions, then grant access only to that origin.',
    optional: 'Optional',
  },
  'zh-Hans': {
    guide: '连接前说明',
    googleGuide: '无需 API Key 或额外网站权限，可立即使用。实测 4 个并发批次最快，LingoFlow 会将跨标签页的 Google 请求总数限制在 40；如果隐私、稳定性或术语控制很重要，请使用已配置的翻译服务。',
    azureGuide: '填写 Translator Endpoint、订阅密钥和资源区域。LingoFlow 只会请求访问你配置的 Endpoint 来源。',
    openAIGuide: '兼容 OpenAI、Ollama、LM Studio 等服务。确认 Base URL 包含 /v1，选择支持 Chat Completions 的模型，然后仅授权该来源。',
    optional: '可选',
  },
} as const
</script>

<template>
  <div class="provider-configuration">
    <div class="section-heading">
      <h2>{{ copy('options.providers') }}</h2>
      <span class="status-mark" :data-ready="selectedProviderConfigured">
        {{ selectedProviderConfigured ? '✓' : '!' }}
      </span>
    </div>
    <p class="section-intro">
      {{ selectedProviderConfigured ? copy('options.providerConfigured') : copy('options.providerIncomplete') }}
    </p>

    <div class="provider-guide">
      <strong>{{ localCopy('guide') }}</strong>
      <p>{{ providerGuide }}</p>
    </div>

    <div class="form-grid">
      <lf-form-field
        :label="copy('options.defaultProvider')"
        type="select"
        :model-value="modelValue.defaultProviderId"
        :options="Object.entries(modelValue.providers).map(([id, provider]) => ({ value: id, label: provider.name }))"
        @update:model-value="setDefaultProvider(String($event))"
      />
      <lf-form-field
        v-if="showFallback"
        :label="copy('options.fallbackProvider')"
        type="select"
        :model-value="modelValue.fallbackProviderId"
        :options="fallbackProviderOptions"
        @update:model-value="commit(settings => settings.fallbackProviderId = String($event))"
      />
    </div>

    <div v-if="activeProviderFields.length" class="form-divider"></div>
    <div v-if="activeProvider" class="provider-fields">
      <lf-form-field
        v-for="field in activeProviderFields"
        :key="field.key"
        :label="field.label"
        :type="field.type as 'text' | 'password' | 'url'"
        :placeholder="field.placeholder"
        :model-value="activeProvider.values[field.key] ?? ''"
        @update:model-value="updateProviderValue(field.key, String($event))"
      />
    </div>

    <template v-if="activeProvider && isOpenAICompatibleProvider">
      <div class="form-divider"></div>
      <div class="provider-speed-controls">
        <lf-form-field
          :label="copy('options.reasoningEffort')"
          type="select"
          :model-value="activeProvider.values.reasoningEffort ?? 'auto'"
          :options="reasoningEffortOptions.map(item => ({ value: item, label: copy(reasoningEffortCopyKey(item)) }))"
          @update:model-value="updateProviderValue('reasoningEffort', String($event))"
        />
        <lf-form-field
          :label="copy('options.disableThinking')"
          type="checkbox"
          :model-value="activeProvider.values.disableThinking === 'true'"
          @update:model-value="updateProviderValue('disableThinking', String($event))"
        />
      </div>
    </template>

    <div class="form-divider"></div>
    <div class="provider-actions">
      <lf-button
        v-if="Object.keys(modelValue.providers).length > 1"
        :variant="pendingRemoveProviderId === modelValue.defaultProviderId ? 'danger-confirm' : 'danger'"
        :label="pendingRemoveProviderId === modelValue.defaultProviderId ? copy('options.confirmRemoveProvider') : copy('options.removeProvider')"
        @click="requestRemoveProvider(modelValue.defaultProviderId)"
      />
      <div class="add-provider-area">
        <lf-button
          variant="ghost"
          :label="copy('options.addProvider')"
          @click="showAddProviderMenu = !showAddProviderMenu"
        />
        <div v-if="showAddProviderMenu" class="add-provider-menu">
          <button
            v-for="preset in availablePresets"
            :key="preset.id"
            class="menu-item"
            type="button"
            @click="addProvider(preset.id)"
          >
            {{ preset.name }}
          </button>
          <button class="menu-item" type="button" @click="openCustomProviderForm">
            {{ copy('options.customOpenAI') }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="showCustomProviderForm" class="custom-provider-form">
      <h3>{{ copy('options.customOpenAI') }}</h3>
      <div class="form-grid">
        <lf-form-field
          :label="copy('options.customProviderName')"
          v-model="customProviderName"
          placeholder="Ollama, LM Studio, DeepSeek…"
        />
        <lf-form-field label="Base URL" type="url" v-model="customProviderBaseUrl" placeholder="http://localhost:11434/v1" />
        <lf-form-field label="API Key" type="password" v-model="customProviderApiKey" :placeholder="localCopy('optional')" />
        <lf-form-field label="Model" v-model="customProviderModel" placeholder="qwen3" />
      </div>
      <div class="custom-provider-actions">
        <lf-button variant="ghost" :label="copy('options.cancel')" @click="showCustomProviderForm = false" />
        <lf-button
          variant="primary"
          :label="copy('options.addProvider')"
          :disabled="!customProviderName.trim() || !customProviderBaseUrl.trim() || !customProviderModel.trim()"
          @click="confirmCustomProvider"
        />
      </div>
    </div>

    <div class="form-divider"></div>
    <div class="connection-test">
      <div>
        <strong>{{ copy('options.testConnection') }}</strong>
        <p>{{ copy('options.connectionTestDescription') }}</p>
      </div>
      <lf-button
        variant="test"
        :label="testingConnection ? copy('options.testingConnection') : copy('options.testConnection')"
        :disabled="testingConnection"
        @click="testConnection"
      />
      <p
        v-if="connectionResult"
        class="connection-result"
        :data-success="connectionResult.ok"
        aria-live="polite"
      >
        {{ connectionResult.ok ? '✓' : '!' }} {{ connectionMessage }}
      </p>
    </div>

    <template v-if="showPerformance">
      <div class="form-divider"></div>
      <div class="settings-group settings-group--compact">
        <div class="settings-group__intro">
          <h3>{{ copy('options.performance') }}</h3>
          <p>{{ copy('options.performanceDescription') }}</p>
        </div>
        <div class="form-grid form-grid--single">
          <lf-form-field
            :label="copy('options.translationConcurrency')"
            type="number"
            :model-value="modelValue.translationConcurrency"
            :min="1"
            :max="6"
            :step="1"
            @update:model-value="commit(settings => settings.translationConcurrency = Number($event))"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.section-heading,
.provider-actions,
.connection-test {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.section-heading h2 {
  margin: 0;
}

.status-mark {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  border: 1px solid var(--lf-rule);
  border-radius: 50%;
  background: color-mix(in srgb, var(--lf-danger) 6%, var(--lf-paper));
  color: var(--lf-danger, #a33a2b);
}

.status-mark[data-ready="true"] {
  background: color-mix(in srgb, var(--lf-success) 7%, var(--lf-paper));
  color: var(--lf-success, #357a52);
}

.section-intro,
.provider-guide p,
.connection-test p,
.settings-group__intro p {
  color: var(--lf-muted);
  line-height: 1.55;
}

.provider-guide {
  margin: 20px 0;
  border: 1px solid color-mix(in srgb, var(--lf-accent) 14%, var(--lf-rule));
  border-radius: var(--lf-radius);
  padding: 14px 16px;
  background: color-mix(in srgb, var(--lf-accent) 5%, var(--lf-paper));
}

.provider-guide p {
  margin: 5px 0 0;
}

.form-grid,
.provider-fields,
.provider-speed-controls {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.form-grid--single {
  grid-template-columns: minmax(0, 320px);
}

.form-divider {
  margin: 24px 0;
  border-top: 1px solid var(--lf-rule);
}

.add-provider-area {
  position: relative;
}

.add-provider-menu {
  position: absolute;
  z-index: 10;
  top: calc(100% + 6px);
  right: 0;
  min-width: 220px;
  padding: 6px;
  border: 1px solid var(--lf-rule);
  border-radius: var(--lf-radius);
  background: var(--lf-paper);
  box-shadow: 0 14px 34px rgb(23 32 51 / 14%);
}

.menu-item {
  display: block;
  width: 100%;
  border: 0;
  background: transparent;
  color: var(--lf-ink);
  cursor: pointer;
  border-radius: var(--lf-radius-sm);
  padding: 9px 10px;
  text-align: left;
}

.menu-item:hover,
.menu-item:focus-visible {
  background: color-mix(in srgb, var(--lf-accent) 9%, var(--lf-paper));
}

.custom-provider-form {
  margin-top: 20px;
  padding: 18px;
  border: 1px solid var(--lf-rule);
  border-radius: var(--lf-radius);
  background: color-mix(in srgb, var(--lf-margin) 42%, var(--lf-paper));
}

.custom-provider-form h3 {
  margin-top: 0;
}

.custom-provider-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.connection-test {
  align-items: flex-start;
}

.connection-test p {
  margin: 5px 0 0;
}

.connection-result {
  max-width: 280px;
  color: var(--lf-danger, #a33a2b) !important;
}

.connection-result[data-success="true"] {
  color: var(--lf-success, #357a52) !important;
}

.settings-group__intro h3 {
  margin: 0;
}

@media (max-width: 720px) {
  .form-grid,
  .provider-fields,
  .provider-speed-controls {
    grid-template-columns: 1fr;
  }

  .provider-actions,
  .connection-test {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
