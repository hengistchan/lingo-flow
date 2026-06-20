import { testProviderConnection } from './index'

const azureValues = {
  endpoint: 'https://api.cognitive.microsofttranslator.com',
  key: 'azure-secret',
  region: 'eastasia',
}

const openAIValues = {
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

    const result = await testProviderConnection({ presetId: 'azure-translator', values: azureValues })

    expect(result).toEqual({
      ok: true,
      providerId: 'azure-translator',
      messageCode: 'connection_ok',
    })
    expect(JSON.stringify(result)).not.toContain(azureValues.key)
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

    const result = await testProviderConnection({ presetId: 'openai-compatible', values: openAIValues })

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
      testProviderConnection({ presetId: 'azure-translator', values: { ...azureValues, key: '' } }),
    ).resolves.toEqual({
      ok: false,
      providerId: 'azure-translator',
      messageCode: 'config_incomplete',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns provider_failed when a request times out', async () => {
    vi.useFakeTimers()

    const fetchMock = vi.fn().mockImplementation((_url: string, init?: { signal?: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'))
        })
      }) as Promise<Response>
    })
    vi.stubGlobal('fetch', fetchMock)

    const resultPromise = testProviderConnection({ presetId: 'azure-translator', values: azureValues })

    await vi.advanceTimersByTimeAsync(30000)

    const result = await resultPromise

    expect(result).toEqual({
      ok: false,
      providerId: 'azure-translator',
      messageCode: 'provider_failed',
    })

    vi.useRealTimers()
  })

  it('normalizes authentication and network failures', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(testProviderConnection({ presetId: 'azure-translator', values: azureValues })).resolves.toEqual({
      ok: false,
      providerId: 'azure-translator',
      messageCode: 'authentication_failed',
    })
    await expect(testProviderConnection({ presetId: 'openai-compatible', values: openAIValues })).resolves.toEqual({
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
