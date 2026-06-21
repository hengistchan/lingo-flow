# 04. Provider Design

## Provider Types

```ts
export type ProviderType =
  | 'machine-translation'
  | 'llm'
  | 'custom'
```

## Provider Interface

```ts
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
```

## Provider Registry

```ts
export class ProviderRegistry {
  private providers = new Map<string, TranslationProvider>()

  register(provider: TranslationProvider) {
    this.providers.set(provider.id, provider)
  }

  get(providerId: string): TranslationProvider {
    const provider = this.providers.get(providerId)
    if (!provider) throw new Error(`Provider not found: ${providerId}`)
    return provider
  }

  list(): TranslationProvider[] {
    return Array.from(this.providers.values())
  }
}
```

## MVP Providers

### Azure Translator

Role:

- default provider
- fast machine translation
- good for full-page translation

Config:

```ts
export type AzureTranslatorConfig = {
  endpoint: string
  key: string
  region: string
}
```

### OpenAI-compatible

Role:

- high-quality provider
- slower
- supports OpenAI-compatible services such as OpenAI, DeepSeek, Qwen-compatible gateways, Ollama OpenAI server, LM Studio

Config:

```ts
export type OpenAICompatibleConfig = {
  baseUrl: string
  apiKey: string
  model: string
}
```

Prompt version:

```ts
export const OPENAI_PROMPT_VERSION = 'prompt-v1'
```

LLM output must return a JSON array. Implement strict parsing and fallback extraction.

```ts
export function parseOpenAIJsonResult(content: string, expectedLength: number): string[] {
  try {
    const parsed = JSON.parse(content)
    if (Array.isArray(parsed) && parsed.length === expectedLength) {
      return parsed.map(String)
    }
  } catch {}

  const jsonMatch = content.match(/\[[\s\S]*\]/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0])
      if (Array.isArray(parsed) && parsed.length === expectedLength) {
        return parsed.map(String)
      }
    } catch {}
  }

  throw new Error('Invalid LLM translation output')
}
```

## Future Providers

- Google Cloud Translation
- DeepL
- Custom HTTP Provider
- Ollama local model
- Hybrid Provider: machine translation draft + LLM polishing

## Forbidden Provider Strategy

Do not add scraping-style Google Translate or Bing Translate webpage providers in MVP.
The no-key Google Free provider is experimental and is the default provider for new installs; it can be removed or hidden if release policies require it.
