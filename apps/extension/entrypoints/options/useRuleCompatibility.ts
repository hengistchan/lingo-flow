import { revalidateRuleCompatibility } from '@lingoflow/rules'
import type { UserSiteRule } from '@lingoflow/types'
import { ref } from 'vue'
import {
  diagnosePage,
  ensureContentRuntime,
  findAdaptableTab,
} from './page-adaptation-runtime'

export function useRuleCompatibility() {
  const checkingRuleIds = ref<Set<string>>(new Set())

  async function revalidate(rule: UserSiteRule): Promise<UserSiteRule> {
    checkingRuleIds.value = new Set(checkingRuleIds.value).add(rule.id)
    try {
      const optionsTab = await chrome.tabs.getCurrent()
      const targetTab = await findAdaptableTab(optionsTab?.id)
      if (targetTab?.id === undefined) {
        throw new Error('Open a normal webpage before checking rule compatibility.')
      }

      await ensureContentRuntime(targetTab.id)
      const excludedUserRuleIds = [rule.id]
      const baseline = await diagnosePage(targetTab.id, { excludedUserRuleIds })
      const candidate = await diagnosePage(targetTab.id, {
        excludedUserRuleIds,
        ruleOverride: rule,
        requireRuleMatch: true,
      })
      const compatibility = revalidateRuleCompatibility(
        rule.compatibility,
        baseline,
        candidate,
      )

      return {
        ...rule,
        enabled: compatibility.status === 'incompatible' ? false : rule.enabled,
        compatibility,
        updatedAt: new Date().toISOString(),
      }
    } finally {
      const next = new Set(checkingRuleIds.value)
      next.delete(rule.id)
      checkingRuleIds.value = next
    }
  }

  function isChecking(ruleId: string): boolean {
    return checkingRuleIds.value.has(ruleId)
  }

  return { revalidate, isChecking }
}
