import type { ProviderConfig } from '@lingoflow/types'

const PRESET_REQUIRED_FIELDS: Record<string, string[]> = {
  'azure-translator': ['endpoint', 'key', 'region'],
  'google-free-translate': [],
  'openai-compatible': ['baseUrl', 'apiKey', 'model'],
}

export function isProviderConfigured(config: ProviderConfig): boolean {
  const required = config.presetId ? PRESET_REQUIRED_FIELDS[config.presetId] : undefined
  if (!required) return Object.values(config.values).some(v => v.trim())
  return required.every((f: string) => (config.values[f] || "").trim())
}
