export const ONBOARDING_VERSION = 1

export type OnboardingStep =
  | 'welcome'
  | 'reading-language'
  | 'provider-choice'
  | 'provider-configuration'
  | 'connection-test'
  | 'first-page-guide'
  | 'complete'

export type OnboardingStatus =
  | 'not-started'
  | 'in-progress'
  | 'review'
  | 'completed'

export type OnboardingState = {
  version: number
  status: OnboardingStatus
  currentStep: OnboardingStep
  completedAt?: string
}
