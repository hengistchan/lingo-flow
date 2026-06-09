export type ProviderType = 'machine-translation' | 'llm' | 'custom'

export type UiLocale = 'zh-Hans' | 'en'

export type LanguageOption = {
  code: string
  englishName: string
  nativeName: string
  simplifiedChineseName: string
  supportsSource: boolean
  supportsTarget: boolean
}

export type ProviderCapability = {
  speed: 'fast' | 'medium' | 'slow'
  quality: 'standard' | 'high'
  supportsBatch: boolean
  supportsGlossary: boolean
  supportsStreaming: boolean
  maxCharsPerRequest?: number
  maxItemsPerRequest?: number
}

export type TranslateInput = {
  sourceLang: 'auto' | string
  targetLang: string
  texts: string[]
  context?: {
    pageTitle?: string
    pageUrl?: string
    domain?: string
  }
}

export type TranslateOutput = {
  texts: string[]
  raw?: unknown
  usage?: {
    characters?: number
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
    estimatedCost?: number
  }
}

export interface TranslationProvider {
  id: string
  name: string
  type: ProviderType
  capabilities: ProviderCapability
  translate(input: TranslateInput, config: unknown): Promise<TranslateOutput>
  validateConfig?(config: unknown): Promise<boolean>
}

export type TextBlockType = 'heading' | 'paragraph' | 'list' | 'quote' | 'table' | 'unknown'

export type TextBlock = {
  id: string
  elementRefId: string
  text: string
  normalizedText: string
  textHash: string
  sourceLang: 'auto' | string
  targetLang: string
  pageUrl: string
  domain: string
  meta: {
    tagName: string
    depth: number
    visible: boolean
    textLength: number
    blockType: TextBlockType
  }
}

export type TranslationTask = {
  id: string
  blockId: string
  sourceText: string
  normalizedText: string
  textHash: string
  sourceLang: 'auto' | string
  targetLang: string
  providerId: string
  model?: string
  promptVersion?: string
  normalizeVersion?: string
  cacheKey: string
  pageUrl?: string
  domain?: string
}

export type TranslationSuccessResult = {
  taskId: string
  blockId: string
  sourceText: string
  translatedText: string
  sourceLang: 'auto' | string
  targetLang: string
  providerId: string
  model?: string
  promptVersion?: string
  cacheKey: string
  fromCache: boolean
  status: 'success'
}

export type TranslationFailedResult = {
  taskId: string
  blockId: string
  sourceText: string
  translatedText?: string
  sourceLang: 'auto' | string
  targetLang: string
  providerId: string
  model?: string
  promptVersion?: string
  cacheKey: string
  fromCache: false
  status: 'failed'
  error: {
    message: string
    reason?: DegradeReason
  }
}

export type TranslationResult = TranslationSuccessResult | TranslationFailedResult

export type CacheKeyInput = {
  textHash: string
  sourceLang: string
  targetLang: string
  providerId: string
  model?: string
  promptVersion?: string
  normalizeVersion: string
}

export type CachedTranslation = {
  cacheKey: string
  sourceText: string
  normalizedText: string
  translatedText: string
  sourceLang: string
  targetLang: string
  providerId: string
  model?: string
  promptVersion?: string
  normalizeVersion: string
  pageUrl?: string
  domain?: string
  createdAt: number
  updatedAt: number
  lastUsedAt: number
  hitCount: number
  sourceTextLength: number
  translatedTextLength: number
}

export type ProviderId = 'azure-translator' | 'openai-compatible'

export type AzureTranslatorConfig = {
  endpoint: string
  key: string
  region: string
}

export type OpenAICompatibleConfig = {
  baseUrl: string
  apiKey: string
  model: string
}

export type AppSettings = {
  targetLang: string
  sourceLang: 'auto' | string
  renderMode: 'below-original'
  cacheEnabled: boolean
  maxCacheItems: number
  defaultProviderId: ProviderId
  fallbackProviderId?: ProviderId | ''
  providers: {
    azure: AzureTranslatorConfig
    openai: OpenAICompatibleConfig
  }
}

export type PublicRuntimeSettings = {
  targetLang: string
  sourceLang: 'auto' | string
  renderMode: 'below-original'
  cacheEnabled: boolean
  maxCacheItems: number
  providerId: ProviderId
  fallbackProviderId?: ProviderId
  model?: string
  promptVersion?: string
  normalizeVersion: string
}

export type PageTranslationStatus = 'idle' | 'translating' | 'done' | 'failed'

export type PageTranslationProgress = {
  status: PageTranslationStatus
  totalBlocks: number
  translatedBlocks: number
  cacheHits: number
  failedBlocks: number
  message?: string
}

export type ResolveCacheMessage = {
  type: 'translation-cache/resolve'
  payload: {
    tasks: TranslationTask[]
  }
}

export type TranslateBatchMessage = {
  type: 'translation/translateBatch'
  payload: {
    tasks: TranslationTask[]
  }
}

export type GetSettingsMessage = {
  type: 'settings/get'
}

export type GetRuntimeSettingsMessage = {
  type: 'settings/getRuntime'
}

export type SaveSettingsMessage = {
  type: 'settings/save'
  payload: {
    settings: AppSettings
  }
}

export type ClearCacheByDomainMessage = {
  type: 'cache/clearByDomain'
  payload: {
    domain: string
  }
}

export type ClearAllCacheMessage = {
  type: 'cache/clearAll'
}

export type PageTranslateMessage = {
  type: 'page/translate'
}

export type PageClearMessage = {
  type: 'page/clear'
}

export type PageStatusMessage = {
  type: 'page/status'
}

export type LingoFlowMessage =
  | ResolveCacheMessage
  | TranslateBatchMessage
  | GetSettingsMessage
  | GetRuntimeSettingsMessage
  | SaveSettingsMessage
  | ClearCacheByDomainMessage
  | ClearAllCacheMessage
  | PageTranslateMessage
  | PageClearMessage
  | PageStatusMessage

export type MessageResponse<T> =
  | {
      ok: true
      data: T
    }
  | {
      ok: false
      error: {
        code?: string
        message: string
      }
    }

export type DegradeReason =
  | 'cache_read_failed'
  | 'cache_write_failed'
  | 'provider_timeout'
  | 'provider_rate_limited'
  | 'provider_network_error'
  | 'provider_invalid_output'
  | 'provider_auth_failed'
  | 'provider_config_invalid'
  | 'batch_too_large'
  | 'dom_node_missing'
  | 'render_failed'
