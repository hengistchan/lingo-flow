export type RuleSelectionKind = 'content-root' | 'exclude' | 'placement'

export type SelectorCandidateStrategy =
  | 'id'
  | 'test-id'
  | 'role'
  | 'semantic-class'
  | 'class'
  | 'structural-path'

export type SelectorCandidate = {
  selector: string
  strategy: SelectorCandidateStrategy
  matchCount: number
  stabilityScore: number
  warnings: string[]
}

export type RuleSelectionResult = {
  kind: RuleSelectionKind
  pageUrl: string
  domain: string
  element: {
    tagName: string
    textPreview: string
  }
  candidates: SelectorCandidate[]
}

export type RuleCompatibilityStatus = 'compatible' | 'warning' | 'incompatible'

export type RuleCompatibilityMetrics = {
  rootsSelected: number
  collected: number
  skipped: number
}

export type RuleCompatibilityDrift = {
  changed: boolean
  previous: RuleCompatibilityMetrics
  deltas: RuleCompatibilityMetrics
}

export type RuleCompatibilitySnapshot = {
  status: RuleCompatibilityStatus
  baseline: RuleCompatibilityMetrics
  candidate: RuleCompatibilityMetrics
  deltas: RuleCompatibilityMetrics
  warnings: string[]
  evaluatedAt: string
  pageUrl?: string
  drift?: RuleCompatibilityDrift
}

export type UserRuleProvenance = {
  kind: 'manual' | 'interactive'
  pageUrl?: string
  selectedSelector?: string
  selectionKind?: RuleSelectionKind
}
