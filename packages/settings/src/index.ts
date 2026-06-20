import { NORMALIZE_VERSION, resolveSupportedLanguage } from '@lingoflow/shared'
import type {
  AppSettings,
  ProviderConfig,
  PublicRuntimeSettings,
  SettingsSummary,
  UiLocale,
} from '@lingoflow/types'
import { isProviderConfigured } from '@lingoflow/providers'

const SETTINGS_KEY = 'lingoflow:settings'
const CURRENT_SETTINGS_VERSION = 2

type ChromeStorageArea = Pick<typeof chrome.storage.local, 'get' | 'set'>

type SettingsInput = Partial<Omit<AppSettings, 'providers'>> & {
  providers?: Record<string, unknown>
}

export const DEFAULT_SETTINGS: AppSettings = {
  version: CURRENT_SETTINGS_VERSION,
  interfaceLocale: 'auto',
  targetLang: 'zh-Hans',
  sourceLang: 'auto',
  renderMode: 'below-original',
  cacheEnabled: true,
  maxCacheItems: 50000,
  defaultProviderId: 'azure-translator',
  fallbackProviderId: '',
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
    'openai-compatible': {
      id: 'openai-compatible',
      presetId: 'openai-compatible',
      name: 'OpenAI-compatible',
      values: {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: '',
        model: 'gpt-4o-mini',
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
    const inputConfig = inputProviders[key] as Partial<ProviderConfig> | undefined
    if (inputConfig && 'id' in inputConfig) {
      providers[key] = {
        ...defaultConfig,
        ...inputConfig,
        values: { ...defaultConfig.values, ...(inputConfig.values ?? {}) },
      }
    } else {
      providers[key] = { ...defaultConfig }
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

  merged.version = CURRENT_SETTINGS_VERSION
  merged.sourceLang = resolveSupportedLanguage(merged.sourceLang, DEFAULT_SETTINGS.sourceLang)
  merged.targetLang = resolveSupportedLanguage(merged.targetLang, DEFAULT_SETTINGS.targetLang)
  merged.interfaceLocale = resolveInterfaceLocale(merged.interfaceLocale)
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
    cacheEnabled: settings.cacheEnabled,
    maxCacheItems: settings.maxCacheItems,
    providerId,
    fallbackProviderId: settings.fallbackProviderId || undefined,
    model,
    promptVersion: providerId === 'openai-compatible' ? 'prompt-v1' : undefined,
    normalizeVersion: NORMALIZE_VERSION,
  }
}

export function getSettingsSummary(settings: AppSettings): SettingsSummary {
  const providerId = settings.defaultProviderId
  const providerConfig = settings.providers[providerId]

  return {
    sourceLang: settings.sourceLang,
    targetLang: settings.targetLang,
    interfaceLocale: settings.interfaceLocale,
    providerId,
    providerName: providerConfig?.name ?? providerId,
    providerConfigured: providerConfig ? isProviderConfigured(providerConfig) : false,
  }
}

function resolveInterfaceLocale(locale?: 'auto' | UiLocale): 'auto' | UiLocale {
  return locale === 'zh-Hans' || locale === 'en' ? locale : 'auto'
}
