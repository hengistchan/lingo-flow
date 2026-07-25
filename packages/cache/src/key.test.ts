import { buildTranslationCacheKey } from './index'

describe('buildTranslationCacheKey', () => {
  it('includes text hash, languages, provider, model, prompt version, and normalization version', () => {
    expect(
      buildTranslationCacheKey({
        textHash: 'abc123',
        sourceLang: 'en',
        targetLang: 'zh-Hans',
        providerId: 'openai-compatible',
        model: 'gpt-4o-mini',
        promptVersion: 'prompt-v1',
        normalizeVersion: 'v1',
      }),
    ).toBe('translation:abc123:en:zh-Hans:openai-compatible:gpt-4o-mini:prompt-v1:v1')
  })

  it('separates cache entries when provider, target language, or model changes', () => {
    const base = {
      textHash: 'same',
      sourceLang: 'en',
      targetLang: 'zh-Hans',
      providerId: 'azure-translator',
      normalizeVersion: 'v1',
    }

    const azure = buildTranslationCacheKey(base)
    const japanese = buildTranslationCacheKey({ ...base, targetLang: 'ja' })
    const openai = buildTranslationCacheKey({ ...base, providerId: 'openai-compatible', model: 'gpt-4o-mini' })

    expect(new Set([azure, japanese, openai]).size).toBe(3)
  })

  it('invalidates only entries whose translation semantics fingerprint changes', () => {
    const base = {
      textHash: 'same',
      sourceLang: 'en',
      targetLang: 'zh-Hans',
      providerId: 'openai-compatible',
      model: 'gpt-4o-mini',
      promptVersion: 'prompt-v1',
      normalizeVersion: 'v1',
    }

    expect(buildTranslationCacheKey(base)).toBe(
      'translation:same:en:zh-Hans:openai-compatible:gpt-4o-mini:prompt-v1:v1',
    )
    expect(buildTranslationCacheKey({ ...base, semanticsFingerprint: 'g1-abc' })).toBe(
      'translation:same:en:zh-Hans:openai-compatible:gpt-4o-mini:prompt-v1:v1:g1-abc',
    )
    expect(buildTranslationCacheKey({ ...base, semanticsFingerprint: 'g1-def' })).not.toBe(
      buildTranslationCacheKey({ ...base, semanticsFingerprint: 'g1-abc' }),
    )
  })
})
