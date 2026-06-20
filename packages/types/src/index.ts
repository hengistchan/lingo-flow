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

export type TextBlockType =
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'quote'
  | 'table'
  | 'caption'
  | 'description'
  | 'unknown'
export type TranslationInsertion =
  | 'linebreak-inside'
  | 'inline-inside'
  | 'inside-container'
  | 'before-nested-structure'
  | 'after-block'
export type InlineTokenType = 'code' | 'link' | 'keyboard' | 'reference'

export type InlineToken = {
  id: string
  type: InlineTokenType
  text: string
}

export type ContentRootKind = 'html' | 'shadow' | 'pdf' | 'unknown'

export type BlockState =
  | 'pending'
  | 'queued'
  | 'translating'
  | 'translated'
  | 'rendering'
  | 'rendered'
  | 'failed'
  | 'dirty'
  | 'stale'
  | 'skipped'
  | 'cancelled'

export type TranslationBlock = {
  id: string
  revision: number
  runId: string
  text: string
  normalizedText: string
  textHash: string
  requestText: string
  inlineTokens: InlineToken[]
  translatedText?: string
  failure?: {
    message: string
    reason?: string
  }
  state: BlockState
  meta: {
    tagName: string
    carrierTagName: string
    blockType: TextBlockType
    insertion: TranslationInsertion
    depth: number
    visible: boolean
    textLength: number
    rootKind: ContentRootKind
  }
  sourceLang: 'auto' | string
  targetLang: string
  pageUrl: string
  domain: string
}

export type BlockBindingDraft = {
  blockId: string
  carrierElement: HTMLElement
  sourceNodes: Node[]
  commonAncestor: HTMLElement
  sourceSignature: string
}

export type BlockBinding = {
  blockId: string
  revision: number
  runId: string
  carrierElement: HTMLElement
  sourceNodes: Node[]
  commonAncestor: HTMLElement
  insertedNodes: Node[]
  hiddenSourceNodes: HTMLElement[]
  loadingElement: HTMLElement | null
  sourceSignature: string
  collectedAtMutationSeq: number
  rootGeneration: number
}

export type ScanResult = {
  block: TranslationBlock
  binding: BlockBindingDraft
}

export type RenderSkipReason =
  | 'missing-binding'
  | 'detached'
  | 'stale'
  | 'same-text'
  | 'duplicate'
  | 'unsupported-strategy'
  | 'mode-hidden'

export type BlockEvent =
  | { type: 'COLLECT'; runId: string; revision: number }
  | { type: 'ENQUEUE' }
  | { type: 'TRANSLATE_START'; requestId: string }
  | { type: 'TRANSLATE_SUCCESS'; requestId: string; text: string }
  | { type: 'TRANSLATE_FAIL'; requestId: string; error: string }
  | { type: 'RENDER_START' }
  | { type: 'RENDER_COMMIT' }
  | { type: 'RENDER_SKIP'; reason: RenderSkipReason }
  | { type: 'DOM_MUTATED'; currentTextHash?: string }
  | { type: 'REQUEUE'; revision: number }
  | { type: 'MARK_STALE'; reason: string }
  | { type: 'CLEAR' }
  | { type: 'CANCEL' }

export type PageRunState =
  | 'idle'
  | 'scanning'
  | 'translating'
  | 'rendering'
  | 'done'
  | 'partial'
  | 'failed'
  | 'clearing'
  | 'cancelled'

export type PageDisplayMode = 'original' | 'dual' | 'translation'

export type MutationCause =
  | 'initial-scan'
  | 'child-list'
  | 'character-data'
  | 'attributes'
  | 'route-change'
  | 'viewport'
  | 'shadow-root'
  | 'large-churn'
  | 'manual'

export type RuntimeEvent =
  | { type: 'scan:started'; runId: string; rootGeneration: number }
  | { type: 'scan:completed'; runId: string; blockIds: string[] }
  | { type: 'block:collected'; runId: string; blockId: string; revision: number }
  | { type: 'block:stateChanged'; blockId: string; from: BlockState; to: BlockState; reason?: string }
  | { type: 'block:dirty'; blockId: string; revision: number; cause: MutationCause }
  | { type: 'queue:changed'; queued: number; inFlight: number }
  | { type: 'translation:requested'; blockIds: string[]; requestId: string }
  | { type: 'translation:resolved'; blockId: string; requestId: string; revision: number; text: string }
  | { type: 'translation:failed'; blockId: string; requestId: string; revision: number; error: string }
  | { type: 'translation:discarded'; blockId: string; requestId: string; reason: string }
  | { type: 'render:committed'; blockId: string; revision: number; nodeCount: number }
  | { type: 'render:skipped'; blockId: string; revision: number; reason: RenderSkipReason }
  | { type: 'binding:disconnected'; blockId: string; revision: number }
  | { type: 'binding:rebound'; blockId: string; fromRevision: number; toRevision: number }
  | { type: 'observer:newContent'; root: HTMLElement; cause: MutationCause }
  | { type: 'observer:viewportEnter'; blockId: string }
  | { type: 'observer:viewportExit'; blockId: string }
  | { type: 'page:runStateChanged'; from: PageRunState; to: PageRunState }
  | { type: 'page:displayModeChanged'; from: PageDisplayMode; to: PageDisplayMode }

export type StalenessResult =
  | { ok: true }
  | {
      ok: false
      reason:
        | 'run-mismatch'
        | 'revision-mismatch'
        | 'detached'
        | 'text-changed'
        | 'source-signature-changed'
        | 'root-replaced'
    }

export type BlockVersion = {
  blockId: string
  runId: string
  revision: number
  textHash: string
  sourceSignature: string
  collectedAtMutationSeq: number
  rootGeneration: number
}

export type QueuePriority = 'viewport' | 'normal' | 'background'

export type QueuedBatch = {
  blockIds: string[]
  totalChars: number
}

export type BatchLimits = {
  maxItems: number
  maxChars: number
}

export interface PageAdapter {
  readonly name: string
  canHandle(root: Document): boolean
  getContentRoots(root: Document): Array<Document | ShadowRoot | HTMLElement>
  classifyRoot(root: Node): ContentRootKind
}

export type InsertionPlan = {
  blockId: string
  mode: PageDisplayMode
  target: HTMLElement
  translationElement: HTMLElement
  placement: TranslationInsertion
  sourceNodesToHide: HTMLElement[]
}

export type InsertionResult = {
  blockId: string
  insertedNodes: Node[]
  hiddenSourceNodes: HTMLElement[]
}

export type TextBlock = {
  id: string
  elementRefId: string
  text: string
  requestText: string
  normalizedText: string
  textHash: string
  inlineTokens: InlineToken[]
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
    insertion: TranslationInsertion
    carrierTagName: string
  }
}

export type TranslationTask = {
  id: string
  blockId: string
  sourceText: string
  requestText?: string
  normalizedText: string
  textHash: string
  inlineTokens?: InlineToken[]
  insertion?: TranslationInsertion
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
  insertion?: TranslationInsertion
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
  insertion?: TranslationInsertion
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

export type ProviderId = string

export type ProviderPreset = {
  id: string
  name: string
  type: ProviderType
  fields: ProviderFieldDef[]
}

export type ProviderFieldDef = {
  key: string
  label: string
  type: 'text' | 'password' | 'url'
  required: boolean
  placeholder?: string
  defaultValue?: string
}

export type ProviderConfig = {
  id: string
  presetId?: string
  name: string
  values: Record<string, string>
}

export type AzureTranslatorConfig = {
  endpoint: string
  key: string
  region: string
}

export type GoogleFreeTranslateConfig = Record<string, never>

export type OpenAIReasoningEffort = 'auto' | 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'

export type OpenAICompatibleConfig = {
  baseUrl: string
  apiKey: string
  model: string
  reasoningEffort?: OpenAIReasoningEffort
  disableThinking?: boolean
}

export type LegacyRenderMode = 'below-original'

export type AppSettings = {
  version: number
  interfaceLocale: 'auto' | UiLocale
  targetLang: string
  sourceLang: 'auto' | string
  renderMode: LegacyRenderMode
  cacheEnabled: boolean
  maxCacheItems: number
  translationConcurrency: number
  defaultProviderId: ProviderId
  fallbackProviderId?: ProviderId | ''
  providers: Record<string, ProviderConfig>
}

export type SettingsSummary = {
  sourceLang: 'auto' | string
  targetLang: string
  interfaceLocale: 'auto' | UiLocale
  providerId: ProviderId
  providerName: string
  providerConfigured: boolean
}

export type ProviderConnectionMessageCode =
  | 'connection_ok'
  | 'config_incomplete'
  | 'authentication_failed'
  | 'network_failed'
  | 'permission_denied'
  | 'provider_failed'

export type ProviderConnectionResult = {
  ok: boolean
  providerId: ProviderId
  messageCode: ProviderConnectionMessageCode
}

export type PublicRuntimeSettings = {
  targetLang: string
  sourceLang: 'auto' | string
  renderMode: LegacyRenderMode
  cacheEnabled: boolean
  maxCacheItems: number
  translationConcurrency: number
  providerId: ProviderId
  fallbackProviderId?: ProviderId
  model?: string
  promptVersion?: string
  normalizeVersion: string
}

export type PageTranslationStatus = 'idle' | 'translating' | 'done' | 'partial' | 'failed'

export type PageTranslationProgress = {
  status: PageTranslationStatus
  sourceLang: 'auto' | string
  targetLang: string
  totalBlocks: number
  translatedBlocks: number
  cacheHits: number
  failedBlocks: number
  messageCode?: 'no_readable_text' | 'runtime_error'
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

export type GetSettingsSummaryMessage = {
  type: 'settings/getSummary'
}

export type SaveSettingsMessage = {
  type: 'settings/save'
  payload: {
    settings: AppSettings
  }
}

export type TestProviderConnectionMessage = {
  type: 'provider/testConnection'
  payload: {
    providerId: ProviderId
    config: ProviderConfig
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
  payload?: {
    sourceLang?: 'auto' | string
    targetLang?: string
  }
}

export type PageClearMessage = {
  type: 'page/clear'
}

export type PageClearCacheMessage = {
  type: 'page/clearCache'
}

export type PageStatusMessage = {
  type: 'page/status'
}

export type PageProgressUpdateMessage = {
  type: 'page/progressUpdate'
  payload: PageTranslationProgress
}

export type LingoFlowMessage =
  | ResolveCacheMessage
  | TranslateBatchMessage
  | GetSettingsMessage
  | GetRuntimeSettingsMessage
  | GetSettingsSummaryMessage
  | SaveSettingsMessage
  | TestProviderConnectionMessage
  | ClearCacheByDomainMessage
  | ClearAllCacheMessage
  | PageTranslateMessage
  | PageClearMessage
  | PageClearCacheMessage
  | PageStatusMessage
  | PageProgressUpdateMessage

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
