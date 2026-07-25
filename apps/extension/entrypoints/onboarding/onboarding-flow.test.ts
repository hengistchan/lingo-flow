import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@lingoflow/settings'
import {
  adjacentOnboardingStep,
  beginOnboarding,
  setOnboardingStep,
} from './onboarding-flow'

describe('onboarding flow', () => {
  it('starts fresh and review states from welcome', () => {
    expect(beginOnboarding(DEFAULT_SETTINGS).onboarding).toMatchObject({
      status: 'in-progress',
      currentStep: 'welcome',
    })
    expect(beginOnboarding({
      ...DEFAULT_SETTINGS,
      onboarding: { version: 1, status: 'review', currentStep: 'provider-choice' },
    }).onboarding.currentStep).toBe('welcome')
  })

  it('resumes an interrupted step and advances through the ordered flow', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      onboarding: { version: 1, status: 'in-progress' as const, currentStep: 'provider-choice' as const },
    }
    expect(beginOnboarding(settings).onboarding.currentStep).toBe('provider-choice')
    expect(adjacentOnboardingStep('provider-choice', 1)).toBe('provider-configuration')
    expect(adjacentOnboardingStep('welcome', -1)).toBe('welcome')
    expect(adjacentOnboardingStep('first-page-guide', 1)).toBe('complete')
  })

  it('marks completion with the current onboarding version', () => {
    expect(setOnboardingStep(DEFAULT_SETTINGS, 'complete').onboarding).toMatchObject({
      version: 1,
      status: 'completed',
      currentStep: 'complete',
      completedAt: expect.any(String),
    })
  })
})
