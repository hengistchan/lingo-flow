import { NORMALIZE_VERSION, resolveSupportedLanguage } from '@lingoflow/shared'
import type {
  AppSettings,
  AzureTranslatorConfig,
  OpenAICompatibleConfig,
  PublicRuntimeSettings,
  SettingsSummary,
  UiLocale,
} from '@lingoflow/types'

const SETTINGS_KEY = 'lingoflow:settings'
const CURRENT_SETTINGS_VERSION = 1

type ChromeStorageArea = Pick<typeof chrome.storage.local, 'get' | 'set'>

type SettingsInput = Partial<Omit<AppSettings, 'providers'>> & {
  providers?: {
    azure?: Partial<AzureTranslatorConfig>
    openai?: Partial<OpenAICompatibleConfig>
  }
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
    azure: {
      endpoint: 'https://api.cognitive.microsofttranslator.com',
      key: '',
      region: '',
    },
    openai: {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      model: 'gpt-4o-mini',
    },
  },
}

export function migrateSettings(input?: SettingsInput): AppSettings {
  const sourceLang =
    input?.version === undefined && input?.sourceLang === 'en'
      ? 'auto'
      : resolveSupportedLanguage(input?.sourceLang ?? DEFAULT_SETTINGS.sourceLang, DEFAULT_SETTINGS.sourceLang)
  const targetLang = resolveSupportedLanguage(input?.targetLang ?? DEFAULT_SETTINGS.targetLang, DEFAULT_SETTINGS.targetLang)

  return {
    ...DEFAULT_SETTINGS,
    ...input,
    version: CURRENT_SETTINGS_VERSION,
    interfaceLocale: resolveInterfaceLocale(input?.interfaceLocale),
    sourceLang,
    targetLang,
    providers: {
      azure: {
        ...DEFAULT_SETTINGS.providers.azure,
        ...input?.providers?.azure,
      },
      openai: {
        ...DEFAULT_SETTINGS.providers.openai,
        ...input?.providers?.openai,
      },
    },
  }
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
  const model = providerId === 'openai-compatible' ? settings.providers.openai.model : undefined

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

  return {
    sourceLang: settings.sourceLang,
    targetLang: settings.targetLang,
    interfaceLocale: settings.interfaceLocale,
    providerId,
    providerName: providerId === 'azure-translator' ? 'Azure Translator' : 'OpenAI-compatible',
    providerConfigured:
      providerId === 'azure-translator'
        ? isAzureConfigured(settings.providers.azure)
        : isOpenAIConfigured(settings.providers.openai),
  }
}

function resolveInterfaceLocale(locale?: 'auto' | UiLocale): 'auto' | UiLocale {
  return locale === 'zh-Hans' || locale === 'en' ? locale : 'auto'
}

function isAzureConfigured(config: AzureTranslatorConfig): boolean {
  return Boolean(config.endpoint.trim() && config.key.trim() && config.region.trim())
}

function isOpenAIConfigured(config: OpenAICompatibleConfig): boolean {
  return Boolean(config.baseUrl.trim() && config.apiKey.trim() && config.model.trim())
}
