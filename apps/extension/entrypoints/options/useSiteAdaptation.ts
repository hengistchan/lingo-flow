import { compareRuleDiagnostics } from '@lingoflow/rules'
import type {
  PageDiagnostics,
  RuleSelectionKind,
  RuleSelectionResult,
  SelectorCandidate,
  TranslationPosition,
  UserSiteRule,
} from '@lingoflow/types'
import { computed, ref } from 'vue'
import { buildInteractiveRule } from './site-adaptation'

type AdaptationStage = 'idle' | 'selecting' | 'testing' | 'review' | 'error'

export function useSiteAdaptation(existingRules: () => UserSiteRule[]) {
  const stage = ref<AdaptationStage>('idle')
  const selection = ref<RuleSelectionResult | null>(null)
  const selectedCandidate = ref<SelectorCandidate | null>(null)
  const draftRule = ref<UserSiteRule | null>(null)
  const error = ref('')
  const translationPosition = ref<TranslationPosition>('after')
  const optionsTabId = ref<number>()
  const targetTabId = ref<number>()

  const canSave = computed(() =>
    stage.value === 'review' &&
    draftRule.value?.compatibility?.status !== 'incompatible',
  )

  async function begin(kind: RuleSelectionKind): Promise<void> {
    stage.value = 'selecting'
    error.value = ''
    selection.value = null
    selectedCandidate.value = null
    draftRule.value = null

    try {
      const optionsTab = await chrome.tabs.getCurrent()
      optionsTabId.value = optionsTab?.id
      const targetTab = await findAdaptableTab(optionsTab?.id)
      if (targetTab?.id === undefined) {
        throw new Error('Open a normal webpage before starting site adaptation.')
      }
      targetTabId.value = targetTab.id
      await ensureContentRuntime(targetTab.id)
      const baseline = await diagnose(targetTab.id)

      await chrome.tabs.update(targetTab.id, { active: true })
      const response = await chrome.tabs.sendMessage(targetTab.id, {
        type: 'page/startRuleSelection',
        payload: { kind },
      })
      if (!response?.ok) throw new Error(response?.error?.message ?? 'Page selection failed.')
      selection.value = response.data as RuleSelectionResult
      selectedCandidate.value = selection.value.candidates[0] ?? null
      if (!selectedCandidate.value) {
        throw new Error('No stable selector could be generated for that element.')
      }

      await evaluateCandidate(baseline)
      if (optionsTabId.value !== undefined) {
        await chrome.tabs.update(optionsTabId.value, { active: true })
      }
    } catch (cause) {
      stage.value = 'error'
      error.value = cause instanceof Error ? cause.message : String(cause)
      if (optionsTabId.value !== undefined) {
        await chrome.tabs.update(optionsTabId.value, { active: true }).catch(() => {})
      }
    }
  }

  async function chooseCandidate(candidate: SelectorCandidate): Promise<void> {
    if (!selection.value || targetTabId.value === undefined) return
    selectedCandidate.value = candidate
    stage.value = 'testing'
    try {
      const baseline = await diagnose(targetTabId.value)
      await evaluateCandidate(baseline)
    } catch (cause) {
      stage.value = 'error'
      error.value = cause instanceof Error ? cause.message : String(cause)
    }
  }

  async function setPosition(position: TranslationPosition): Promise<void> {
    translationPosition.value = position
    if (selection.value?.kind === 'placement' && selectedCandidate.value) {
      await chooseCandidate(selectedCandidate.value)
    }
  }

  function reset(): void {
    stage.value = 'idle'
    selection.value = null
    selectedCandidate.value = null
    draftRule.value = null
    error.value = ''
  }

  async function evaluateCandidate(baseline: PageDiagnostics): Promise<void> {
    if (!selection.value || !selectedCandidate.value || targetTabId.value === undefined) return
    stage.value = 'testing'
    const draft = buildInteractiveRule({
      selection: selection.value,
      selector: selectedCandidate.value.selector,
      existingRules: existingRules(),
      translationPosition: translationPosition.value,
    })
    const candidate = await diagnose(targetTabId.value, draft)
    draft.compatibility = compareRuleDiagnostics(baseline, candidate)
    draftRule.value = draft
    stage.value = 'review'
  }

  return {
    stage,
    selection,
    selectedCandidate,
    draftRule,
    error,
    translationPosition,
    canSave,
    begin,
    chooseCandidate,
    setPosition,
    reset,
  }
}

async function findAdaptableTab(excludeTabId?: number): Promise<chrome.tabs.Tab | undefined> {
  const tabs = await chrome.tabs.query({ currentWindow: true })
  return tabs
    .filter(tab =>
      tab.id !== excludeTabId &&
      !!tab.url &&
      /^https?:\/\//.test(tab.url),
    )
    .sort((left, right) => (right.lastAccessed ?? 0) - (left.lastAccessed ?? 0))[0]
}

async function ensureContentRuntime(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['lingoflow-content.js'],
    })
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content-scripts/content.js'],
    })
  }
}

async function diagnose(tabId: number, ruleOverride?: UserSiteRule): Promise<PageDiagnostics> {
  const response = await chrome.tabs.sendMessage(tabId, {
    type: 'page/diagnose',
    payload: ruleOverride ? { ruleOverride } : undefined,
  })
  if (!response?.ok) throw new Error(response?.error?.message ?? 'Compatibility test failed.')
  return response.data as PageDiagnostics
}
