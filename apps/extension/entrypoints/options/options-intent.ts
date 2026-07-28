import type { RuleSelectionKind } from '@lingoflow/types'

export type SettingsSection = 'general' | 'providers' | 'terminology' | 'localData' | 'siteRules'

export type OptionsIntent = {
  section: SettingsSection
  adaptKind?: RuleSelectionKind
  targetTabId?: number
}

const SETTINGS_SECTIONS = new Set<SettingsSection>([
  'general',
  'providers',
  'terminology',
  'localData',
  'siteRules',
])

const RULE_SELECTION_KINDS = new Set<RuleSelectionKind>([
  'content-root',
  'exclude',
  'placement',
])

export function parseOptionsIntent(search: string): OptionsIntent {
  const params = new URLSearchParams(search)
  const requestedSection = params.get('section') as SettingsSection | null
  const requestedKind = params.get('adapt') as RuleSelectionKind | null
  const parsedTargetTabId = Number(params.get('targetTabId'))
  const adaptKind = requestedKind && RULE_SELECTION_KINDS.has(requestedKind)
    ? requestedKind
    : undefined

  return {
    section: adaptKind
      ? 'siteRules'
      : requestedSection && SETTINGS_SECTIONS.has(requestedSection)
        ? requestedSection
        : 'general',
    adaptKind,
    targetTabId: Number.isInteger(parsedTargetTabId) && parsedTargetTabId > 0
      ? parsedTargetTabId
      : undefined,
  }
}
