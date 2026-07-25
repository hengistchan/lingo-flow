import { GOOGLE_FREE_TRANSLATE_ENDPOINT } from '@lingoflow/providers'
import type { ProviderConfig } from '@lingoflow/types'

export function getProviderEndpoint(config: ProviderConfig): string {
  if (config.presetId === 'google-free-translate') return GOOGLE_FREE_TRANSLATE_ENDPOINT
  return config.values.endpoint || config.values.baseUrl || ''
}

export function providerOriginPattern(endpoint: string): string | undefined {
  try {
    const url = new URL(endpoint)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined
    return `${url.origin}/*`
  } catch {
    return undefined
  }
}

export async function requestProviderOriginAccess(endpoint: string): Promise<boolean> {
  const origin = providerOriginPattern(endpoint)
  if (!origin) return false
  if (!hasRuntimeApi() || typeof globalThis.chrome?.permissions?.request !== 'function') {
    return true
  }

  if (typeof globalThis.chrome.permissions.contains === 'function') {
    const alreadyAllowed = await chrome.permissions.contains({ origins: [origin] })
    if (alreadyAllowed) return true
  }

  return chrome.permissions.request({ origins: [origin] })
}

export function hasRuntimeApi(): boolean {
  return typeof globalThis.chrome?.runtime?.sendMessage === 'function'
}
