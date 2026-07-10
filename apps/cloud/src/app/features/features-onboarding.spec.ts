import {
  createFeatureEntryOnboardingSteps,
  FEATURE_ENTRY_ONBOARDING_SIDEBAR_EXPAND_DELAY_MS,
  getAvailableFeatureEntryOnboardingSteps,
  getFeatureEntryOnboardingOpenDelayMs,
  getFeatureEntryOnboardingFinishText,
  hasFeatureEntryOnboardingAutoShown,
  isFeatureEntryOnboardingBlocked,
  shouldCreateClawXpertAfterEntryOnboarding,
  shouldExpandSidebarForEntryOnboarding,
  shouldShowFeatureEntryOnboardingForXpertCount,
  shouldAdvanceFeatureEntryOnboardingAfterScopeChange
} from './features-onboarding'
import { RequestScopeLevel } from '../@core/types'

describe('createFeatureEntryOnboardingSteps', () => {
  it('keeps the entry guide focused on the approved organization-level navigation points', () => {
    const steps = createFeatureEntryOnboardingSteps()

    expect(steps.map((step) => step.title)).toEqual([
      'PAC.Chat.ClawXpert.EntryGuideScopeTitle',
      'PAC.Chat.ClawXpert.EntryGuideModelProvidersTitle',
      'PAC.Chat.ClawXpert.EntryGuideWorkspaceTitle'
    ])
    expect(steps.every((step) => step.placement === 'rightTop')).toBe(true)
  })

  it('targets the stable onboarding attributes in order', () => {
    document.body.innerHTML = `
      <button data-onboarding-target="scope-switcher"></button>
      <button data-onboarding-target="plugins-marketplace"></button>
      <button data-onboarding-target="model-providers"></button>
      <button data-onboarding-target="workspace"></button>
    `

    const targets = createFeatureEntryOnboardingSteps().map((step) => step.target?.())

    expect(targets.map((target) => target?.getAttribute('data-onboarding-target'))).toEqual([
      'scope-switcher',
      'model-providers',
      'workspace'
    ])
  })

  it('keeps the guide scope-neutral by filtering unavailable targets', () => {
    document.body.innerHTML = `
      <button data-onboarding-target="scope-switcher"></button>
      <button data-onboarding-target="workspace"></button>
    `

    expect(
      getAvailableFeatureEntryOnboardingSteps(createFeatureEntryOnboardingSteps()).map((step) => step.title)
    ).toEqual(['PAC.Chat.ClawXpert.EntryGuideScopeTitle', 'PAC.Chat.ClawXpert.EntryGuideWorkspaceTitle'])
  })

  it('does not show the entry guide over a dialog backdrop', () => {
    document.body.innerHTML = '<div class="cdk-dialog-container"></div>'

    expect(isFeatureEntryOnboardingBlocked()).toBe(true)
  })

  it('advances after the user switches from tenant scope to organization scope on the scope step', () => {
    const [scopeStep, modelProvidersStep] = createFeatureEntryOnboardingSteps()

    expect(
      shouldAdvanceFeatureEntryOnboardingAfterScopeChange(
        RequestScopeLevel.TENANT,
        RequestScopeLevel.ORGANIZATION,
        scopeStep
      )
    ).toBe(true)
    expect(
      shouldAdvanceFeatureEntryOnboardingAfterScopeChange(
        RequestScopeLevel.ORGANIZATION,
        RequestScopeLevel.ORGANIZATION,
        scopeStep
      )
    ).toBe(false)
    expect(
      shouldAdvanceFeatureEntryOnboardingAfterScopeChange(
        RequestScopeLevel.TENANT,
        RequestScopeLevel.ORGANIZATION,
        modelProvidersStep
      )
    ).toBe(false)
  })

  it('shows the entry guide only when the current user has no self-created xperts', () => {
    expect(shouldShowFeatureEntryOnboardingForXpertCount(0)).toBe(true)
    expect(shouldShowFeatureEntryOnboardingForXpertCount(1)).toBe(false)
    expect(shouldShowFeatureEntryOnboardingForXpertCount(null)).toBe(false)
  })

  it('shows the entry guide when the current user manually requests it', () => {
    expect(shouldShowFeatureEntryOnboardingForXpertCount(1, true)).toBe(true)
    expect(shouldShowFeatureEntryOnboardingForXpertCount(null, true)).toBe(true)
  })

  it('treats a persisted ClawXpert entry guide timestamp as already auto shown', () => {
    expect(hasFeatureEntryOnboardingAutoShown(null)).toBe(false)
    expect(hasFeatureEntryOnboardingAutoShown({})).toBe(false)
    expect(
      hasFeatureEntryOnboardingAutoShown({
        entryGuides: {
          clawxpert: {
            autoShownAt: '2026-07-02T00:00:00.000Z'
          }
        }
      })
    ).toBe(true)
  })

  it('starts the ClawXpert creation flow only when the current user has no self-created xperts', () => {
    expect(shouldCreateClawXpertAfterEntryOnboarding(0)).toBe(true)
    expect(shouldCreateClawXpertAfterEntryOnboarding(1)).toBe(false)
    expect(shouldCreateClawXpertAfterEntryOnboarding(null)).toBe(false)
  })

  it('does not start ClawXpert creation when creation is unavailable', () => {
    expect(shouldCreateClawXpertAfterEntryOnboarding(0, false)).toBe(false)
    expect(getFeatureEntryOnboardingFinishText(0, false)).toBe('PAC.ACTIONS.Done')
  })

  it('uses the setup action only when the account still needs a ClawXpert', () => {
    expect(getFeatureEntryOnboardingFinishText(0)).toBe('PAC.Chat.ClawXpert.EntryGuideCreate')
    expect(getFeatureEntryOnboardingFinishText(0, true)).toBe('PAC.Chat.ClawXpert.EntryGuideCreate')
    expect(getFeatureEntryOnboardingFinishText(1)).toBe('PAC.ACTIONS.Done')
  })

  it('expands the sidebar only while the entry guide is visible', () => {
    expect(shouldExpandSidebarForEntryOnboarding(true, true)).toBe(false)
    expect(shouldExpandSidebarForEntryOnboarding(true, false)).toBe(true)
    expect(shouldExpandSidebarForEntryOnboarding(false, true)).toBe(false)
  })

  it('waits for collapsed sidebar expansion before showing the entry guide highlight', () => {
    expect(getFeatureEntryOnboardingOpenDelayMs(true)).toBe(FEATURE_ENTRY_ONBOARDING_SIDEBAR_EXPAND_DELAY_MS)
    expect(getFeatureEntryOnboardingOpenDelayMs(false)).toBe(0)
  })
})
