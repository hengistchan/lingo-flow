import type { AzureTranslatorConfig, OpenAICompatibleConfig } from '@lingoflow/types'
import { testProviderConnection } from './index'

const azureConfig: AzureTranslatorConfig = {
  endpoint: 'https://api.cognitive.microsofttranslator.com',
  key: 'azure-secret',
  region: 'eastasia',
}

const openAIConfig: OpenAICompatibleConfig = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: 'openai-secret',
  model: 'gpt-test',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('testProviderConnection', () => {
  it('sends one minimal Azure translation request and returns a key-free success result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse([{ translations: [{ text: '连接正常' }] }]),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await testProviderConnection('azure-translator', azureConfig)

    expect(result).toEqual({
      ok: true,
      providerId: 'azure-translator',
      messageCode: 'connection_ok',
    })
    expect(JSON.stringify(result)).not.toContain(azureConfig.key)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual([
      { text: 'LingoFlow connection test.' },
    ])
  })

  it('sends one minimal OpenAI-compatible request and returns success', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        choices: [{ message: { content: '["连接正常"]' } }],
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await testProviderConnection('openai-compatible', openAIConfig)

    expect(result).toEqual({
      ok: true,
      providerId: 'openai-compatible',
      messageCode: 'connection_ok',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns config incomplete without making a request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      testProviderConnection('azure-translator', { ...azureConfig, key: '' }),
    ).resolves.toEqual({
      ok: false,
      providerId: 'azure-translator',
      messageCode: 'config_incomplete',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('normalizes authentication and network failures', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(testProviderConnection('azure-translator', azureConfig)).resolves.toEqual({
      ok: false,
      providerId: 'azure-translator',
      messageCode: 'authentication_failed',
    })
    await expect(testProviderConnection('openai-compatible', openAIConfig)).resolves.toEqual({
      ok: false,
      providerId: 'openai-compatible',
      messageCode: 'network_failed',
    })
  })
})

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
