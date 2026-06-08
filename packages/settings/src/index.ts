import { NORMALIZE_VERSION } from '@lingoflow/shared'
import type { AppSettings, PublicRuntimeSettings } from '@lingoflow/types'

const SETTINGS_KEY = 'lingoflow:settings'

type ChromeStorageArea = Pick<typeof chrome.storage.local, 'get' | 'set'>

export const DEFAULT_SETTINGS: AppSettings = {
  targetLang: 'zh-Hans',
  sourceLang: 'en',
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

export function mergeSettings(input?: Partial<AppSettings>): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...input,
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

export async function getSettings(storage: ChromeStorageArea = chrome.storage.local): Promise<AppSettings> {
  const result = await storage.get(SETTINGS_KEY)
  return mergeSettings(result[SETTINGS_KEY] as Partial<AppSettings> | undefined)
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
