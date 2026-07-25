import { ONBOARDING_VERSION } from '@lingoflow/types'
import type {
  AppSettings,
  OnboardingState,
  OnboardingStep,
} from '@lingoflow/types'

export const ONBOARDING_STEPS: OnboardingStep[] = [
  'welcome',
  'reading-language',
  'provider-choice',
  'provider-configuration',
  'connection-test',
  'first-page-guide',
]

export function beginOnboarding(settings: AppSettings): AppSettings {
  if (settings.onboarding.status === 'completed') return cloneJson(settings)
  const next = cloneJson(settings)
  next.onboarding = {
    version: ONBOARDING_VERSION,
    status: 'in-progress',
    currentStep: resumableStep(settings.onboarding),
  }
  return next
}

export function setOnboardingStep(
  settings: AppSettings,
  step: OnboardingStep,
): AppSettings {
  const next = cloneJson(settings)
  next.onboarding = {
    version: ONBOARDING_VERSION,
    status: step === 'complete' ? 'completed' : 'in-progress',
    currentStep: step,
    ...(step === 'complete' ? { completedAt: new Date().toISOString() } : {}),
  }
  return next
}

export function adjacentOnboardingStep(
  current: OnboardingStep,
  direction: 1 | -1,
): OnboardingStep {
  if (current === 'complete') {
    return direction < 0 ? ONBOARDING_STEPS.at(-1)! : 'complete'
  }
  const index = Math.max(0, ONBOARDING_STEPS.indexOf(current))
  const nextIndex = index + direction
  if (nextIndex < 0) return ONBOARDING_STEPS[0]
  if (nextIndex >= ONBOARDING_STEPS.length) return 'complete'
  return ONBOARDING_STEPS[nextIndex]
}

function resumableStep(state: OnboardingState): OnboardingStep {
  if (state.status === 'in-progress' && ONBOARDING_STEPS.includes(state.currentStep)) {
    return state.currentStep
  }
  return 'welcome'
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
