import { describe, expect, it } from 'vitest'
import { getProviderEndpoint, providerOriginPattern } from './provider-access'

describe('provider access', () => {
  it('normalizes valid provider endpoints to origin permission patterns', () => {
    expect(providerOriginPattern('https://api.example.com/v1/chat')).toBe('https://api.example.com/*')
    expect(providerOriginPattern('http://localhost:11434/v1')).toBe('http://localhost:11434/*')
    expect(providerOriginPattern('file:///tmp/model')).toBeUndefined()
    expect(providerOriginPattern('not a URL')).toBeUndefined()
  })

  it('uses the built-in endpoint for Google Translate Free', () => {
    expect(getProviderEndpoint({
      id: 'google-free-translate',
      presetId: 'google-free-translate',
      name: 'Google Translate Free',
      values: {},
    })).toContain('translate.googleapis.com')
  })
})
