import type {
  AzureTranslatorConfig,
  OpenAICompatibleConfig,
  ProviderConnectionResult,
  ProviderId,
  TranslateInput,
  TranslateOutput,
  TranslationProvider,
} from '@lingoflow/types'

export const OPENAI_PROMPT_VERSION = 'prompt-v1'

export class ProviderRegistry {
  private readonly providers = new Map<string, TranslationProvider>()

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

export function parseOpenAIJsonResult(content: string, expectedLength: number): string[] {
  try {
    const parsed = JSON.parse(content)
    if (Array.isArray(parsed) && parsed.length === expectedLength) {
      return parsed.map(String)
    }
  } catch {
    // Try extracting a JSON array from chatty model output below.
  }

  const jsonMatch = content.match(/\[[\s\S]*\]/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0])
      if (Array.isArray(parsed) && parsed.length === expectedLength) {
        return parsed.map(String)
      }
    } catch {
      // Surface the normalized invalid-output error below.
    }
  }

  throw new Error('Invalid LLM translation output')
}

export const azureTranslatorProvider: TranslationProvider = {
  id: 'azure-translator',
  name: 'Azure Translator',
  type: 'machine-translation',
  capabilities: {
    speed: 'fast',
    quality: 'standard',
    supportsBatch: true,
    supportsGlossary: false,
    supportsStreaming: false,
    maxCharsPerRequest: 50000,
    maxItemsPerRequest: 100,
  },
  async translate(input: TranslateInput, config: unknown): Promise<TranslateOutput> {
    const providerConfig = assertAzureConfig(config)
    const endpoint = providerConfig.endpoint.replace(/\/+$/, '')
    const search = new URLSearchParams({
      'api-version': '3.0',
      to: input.targetLang,
    })

    if (input.sourceLang !== 'auto') {
      search.set('from', input.sourceLang)
    }

    const response = await fetch(`${endpoint}/translate?${search.toString()}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key': providerConfig.key,
        'Ocp-Apim-Subscription-Region': providerConfig.region,
      },
      body: JSON.stringify(input.texts.map(text => ({ text }))),
    })

    if (!response.ok) {
      throw providerHttpError(response.status, `Azure Translator failed with HTTP ${response.status}`)
    }

    const raw = (await response.json()) as Array<{ translations?: Array<{ text?: string }> }>
    const texts = raw.map(item => item.translations?.[0]?.text ?? '')

    if (texts.length !== input.texts.length || texts.some(text => text.length === 0)) {
      throw providerInvalidOutputError('Azure Translator returned an invalid translation payload')
    }

    return { texts, raw, usage: { characters: input.texts.join('').length } }
  },
  async validateConfig(config: unknown) {
    assertAzureConfig(config)
    return true
  },
}

export const openAICompatibleProvider: TranslationProvider = {
  id: 'openai-compatible',
  name: 'OpenAI-compatible',
  type: 'llm',
  capabilities: {
    speed: 'medium',
    quality: 'high',
    supportsBatch: true,
    supportsGlossary: false,
    supportsStreaming: false,
    maxItemsPerRequest: 40,
  },
  async translate(input: TranslateInput, config: unknown): Promise<TranslateOutput> {
    const providerConfig = assertOpenAIConfig(config)
    const baseUrl = providerConfig.baseUrl.replace(/\/+$/, '')
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${providerConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: providerConfig.model,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content:
              'Translate each input string into the requested target language. Return only a JSON array of translated strings, preserving order and length.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              sourceLang: input.sourceLang,
              targetLang: input.targetLang,
              texts: input.texts,
              context: input.context,
            }),
          },
        ],
      }),
    })

    if (!response.ok) {
      throw providerHttpError(response.status, `OpenAI-compatible provider failed with HTTP ${response.status}`)
    }

    const raw = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      usage?: TranslateOutput['usage']
    }
    const content = raw.choices?.[0]?.message?.content
    if (!content) throw providerInvalidOutputError('OpenAI-compatible provider returned no message content')

    return {
      texts: parseOpenAIJsonResult(content, input.texts.length),
      raw,
      usage: raw.usage,
    }
  },
  async validateConfig(config: unknown) {
    assertOpenAIConfig(config)
    return true
  },
}

export function createDefaultProviderRegistry(): ProviderRegistry {
  const registry = new ProviderRegistry()
  registry.register(azureTranslatorProvider)
  registry.register(openAICompatibleProvider)
  return registry
}

export async function testProviderConnection(
  providerId: ProviderId,
  config: AzureTranslatorConfig | OpenAICompatibleConfig,
): Promise<ProviderConnectionResult> {
  const provider =
    providerId === 'azure-translator' ? azureTranslatorProvider : openAICompatibleProvider

  try {
    await provider.translate(
      {
        sourceLang: 'en',
        targetLang: 'zh-Hans',
        texts: ['LingoFlow connection test.'],
      },
      config,
    )

    return { ok: true, providerId, messageCode: 'connection_ok' }
  } catch (error) {
    return {
      ok: false,
      providerId,
      messageCode: getConnectionFailureCode(error),
    }
  }
}

function getConnectionFailureCode(
  error: unknown,
): Exclude<ProviderConnectionResult['messageCode'], 'connection_ok'> {
  const value = error as { code?: string; status?: number }

  if (value?.code === 'provider_config_invalid') return 'config_incomplete'
  if (value?.status === 401 || value?.status === 403) return 'authentication_failed'
  if (error instanceof TypeError) return 'network_failed'
  return 'provider_failed'
}

function assertAzureConfig(config: unknown): AzureTranslatorConfig {
  const value = config as Partial<AzureTranslatorConfig>
  if (!value?.endpoint || !value.key || !value.region) {
    throw providerConfigError('Azure Translator endpoint, key, and region are required')
  }
  return value as AzureTranslatorConfig
}

function assertOpenAIConfig(config: unknown): OpenAICompatibleConfig {
  const value = config as Partial<OpenAICompatibleConfig>
  if (!value?.baseUrl || !value.apiKey || !value.model) {
    throw providerConfigError('OpenAI-compatible base URL, API key, and model are required')
  }
  return value as OpenAICompatibleConfig
}

export function providerHttpError(status: number, message: string): Error & { status: number } {
  const error = new Error(message) as Error & { status: number }
  error.status = status
  return error
}

export function providerInvalidOutputError(message: string): Error & { code: string } {
  const error = new Error(message) as Error & { code: string }
  error.code = 'provider_invalid_output'
  return error
}

export function providerConfigError(message: string): Error & { code: string } {
  const error = new Error(message) as Error & { code: string }
  error.code = 'provider_config_invalid'
  return error
}
