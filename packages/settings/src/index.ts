import { NORMALIZE_VERSION, resolveSupportedLanguage, isProviderConfigured } from '@lingoflow/shared'
import type {
  AppSettings,
  ProviderConfig,
  PublicRuntimeSettings,
  SettingsSummary,
  UiLocale,
} from '@lingoflow/types'

const SETTINGS_KEY = 'lingoflow:settings'
const CURRENT_SETTINGS_VERSION = 5
const DEFAULT_TRANSLATION_CONCURRENCY = 3
const MIN_TRANSLATION_CONCURRENCY = 1
const MAX_TRANSLATION_CONCURRENCY = 6

type ChromeStorageArea = Pick<typeof chrome.storage.local, 'get' | 'set'>

type SettingsInput = Partial<Omit<AppSettings, 'providers'>> & {
  providers?: Record<string, unknown>
}

export const DEFAULT_SETTINGS: AppSettings = {
  version: CURRENT_SETTINGS_VERSION,
  interfaceLocale: 'auto',
  uiTheme: 'system',
  targetLang: 'zh-Hans',
  sourceLang: 'auto',
  renderMode: 'below-original',
  cacheEnabled: true,
  maxCacheItems: 50000,
  translationConcurrency: DEFAULT_TRANSLATION_CONCURRENCY,
  defaultProviderId: 'google-free-translate',
  fallbackProviderId: '',
  userRules: [],
  providers: {
    'azure-translator': {
      id: 'azure-translator',
      presetId: 'azure-translator',
      name: 'Azure Translator',
      values: {
        endpoint: 'https://api.cognitive.microsofttranslator.com',
        key: '',
        region: '',
      },
    },
    'google-free-translate': {
      id: 'google-free-translate',
      presetId: 'google-free-translate',
      name: 'Google Translate Free (experimental)',
      values: {},
    },
    'openai-compatible': {
      id: 'openai-compatible',
      presetId: 'openai-compatible',
      name: 'OpenAI-compatible',
      values: {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: '',
        model: 'gpt-4o-mini',
        reasoningEffort: 'auto',
        disableThinking: 'false',
      },
    },
  },
}

export function migrateSettings(input?: SettingsInput): AppSettings {
  const merged: AppSettings = { ...DEFAULT_SETTINGS, ...input as AppSettings }

  // Merge providers from input into defaults
  const inputProviders = (input?.providers ?? {}) as Record<string, unknown>
  const providers: Record<string, ProviderConfig> = {}
  for (const [key, defaultConfig] of Object.entries(DEFAULT_SETTINGS.providers)) {
    const inputConfig = inputProviders[key]
    if (isProviderConfig(inputConfig)) {
      providers[key] = {
        ...defaultConfig,
        ...inputConfig,
        id: key,
        values: { ...defaultConfig.values, ...(inputConfig.values ?? {}) },
      }
    } else {
      providers[key] = { ...defaultConfig }
    }
  }

  // Custom providers are first-class persisted settings. They do not have a
  // built-in default to merge with, so preserve every structurally valid
  // provider entry that was supplied by the user.
  for (const [key, inputConfig] of Object.entries(inputProviders)) {
    if (key in providers || !isProviderConfig(inputConfig)) continue
    providers[key] = {
      id: key,
      presetId: inputConfig.presetId,
      name: inputConfig.name,
      values: { ...inputConfig.values },
    }
  }
  merged.providers = providers

  let version = input?.version ?? 0

  // Migration v0 -> v1: sourceLang "en" to "auto"
  if (version < 1) {
    if (merged.sourceLang === 'en') merged.sourceLang = 'auto'
  }

  // Migration v1 -> v2: old fixed providers to new record format
  if (version < 2) {
    const oldProviders = inputProviders
    if ('azure' in oldProviders && typeof oldProviders.azure === 'object' && !('id' in (oldProviders.azure as object))) {
      merged.providers = {
        'azure-translator': {
          id: 'azure-translator',
          presetId: 'azure-translator',
          name: 'Azure Translator',
          values: {
            ...DEFAULT_SETTINGS.providers['azure-translator'].values,
            ...((oldProviders.azure as Record<string, string>) || {}),
          },
        },
        'openai-compatible': {
          id: 'openai-compatible',
          presetId: 'openai-compatible',
          name: 'OpenAI-compatible',
          values: {
            ...DEFAULT_SETTINGS.providers['openai-compatible'].values,
            ...((oldProviders.openai as Record<string, string>) || {}),
          },
        },
      }
    }
  }

  // Migration v4 -> v5: add local user-authored site rules.
  if (version < 5 || !Array.isArray(merged.userRules)) {
    merged.userRules = Array.isArray(merged.userRules) ? merged.userRules : []
  }

  merged.version = CURRENT_SETTINGS_VERSION
  merged.sourceLang = resolveSupportedLanguage(merged.sourceLang, DEFAULT_SETTINGS.sourceLang)
  merged.targetLang = resolveSupportedLanguage(merged.targetLang, DEFAULT_SETTINGS.targetLang)
  merged.interfaceLocale = resolveInterfaceLocale(merged.interfaceLocale)
  merged.translationConcurrency = clampTranslationConcurrency(merged.translationConcurrency)
  return merged
}

export function mergeSettings(input?: SettingsInput): AppSettings {
  return migrateSettings(input)
}

export async function getSettings(storage: ChromeStorageArea = chrome.storage.local): Promise<AppSettings> {
  const result = await storage.get(SETTINGS_KEY)
  return migrateSettings(result[SETTINGS_KEY] as SettingsInput | undefined)
}

export async function saveSettings(settings: AppSettings, storage: ChromeStorageArea = chrome.storage.local) {
  await storage.set({
    [SETTINGS_KEY]: mergeSettings(settings),
  })
}

export function getPublicRuntimeSettings(settings: AppSettings): PublicRuntimeSettings {
  const providerId = settings.defaultProviderId
  const providerConfig = settings.providers[providerId]
  const model = providerConfig?.values.model

  return {
    targetLang: settings.targetLang,
    sourceLang: settings.sourceLang,
    renderMode: settings.renderMode,
    displayMode: 'dual',
    cacheEnabled: settings.cacheEnabled,
    maxCacheItems: settings.maxCacheItems,
    translationConcurrency: settings.translationConcurrency,
    providerId,
    fallbackProviderId: settings.fallbackProviderId || undefined,
    model,
    promptVersion: providerId === 'openai-compatible' ? 'prompt-v1' : undefined,
    normalizeVersion: NORMALIZE_VERSION,
    userRules: settings.userRules.filter(rule => rule.enabled),
  }
}

export function getSettingsSummary(settings: AppSettings): SettingsSummary {
  const providerId = settings.defaultProviderId
  const providerConfig = settings.providers[providerId]

  return {
    sourceLang: settings.sourceLang,
    targetLang: settings.targetLang,
    interfaceLocale: settings.interfaceLocale,
    uiTheme: settings.uiTheme,
    providerId,
    providerName: providerConfig?.name ?? providerId,
    providerConfigured: providerConfig ? isProviderConfigured(providerConfig) : false,
  }
}

function resolveInterfaceLocale(locale?: 'auto' | UiLocale): 'auto' | UiLocale {
  return locale === 'zh-Hans' || locale === 'en' ? locale : 'auto'
}

function clampTranslationConcurrency(value: unknown): number {
  const numeric = typeof value === 'number' && Number.isFinite(value)
    ? Math.floor(value)
    : DEFAULT_TRANSLATION_CONCURRENCY
  return Math.min(MAX_TRANSLATION_CONCURRENCY, Math.max(MIN_TRANSLATION_CONCURRENCY, numeric))
}

function isProviderConfig(value: unknown): value is ProviderConfig {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<ProviderConfig>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    !!candidate.values &&
    typeof candidate.values === 'object' &&
    !Array.isArray(candidate.values) &&
    Object.values(candidate.values).every(item => typeof item === 'string')
  )
}
