import type { ElementRef } from '@angular/core'
import type { IUserOrganizationPreferences } from '@xpert-ai/contracts'
import { USER_ORGANIZATION_ENTRY_GUIDE_CLAWXPERT } from '@xpert-ai/contracts'
import type { ZardHighlightStep, ZardHighlightTarget } from '@xpert-ai/headless-ui'
import { RequestScopeLevel } from '../@core/types'

export type FeatureEntryOnboardingStepKey = 'scope-switcher' | 'plugins-marketplace' | 'model-providers' | 'workspace'
export const FEATURE_ENTRY_ONBOARDING_GUIDE_KEY = USER_ORGANIZATION_ENTRY_GUIDE_CLAWXPERT
export const FEATURE_ENTRY_ONBOARDING_SIDEBAR_EXPAND_DELAY_MS = 320

export interface FeatureEntryOnboardingStep extends ZardHighlightStep {
  key: FeatureEntryOnboardingStepKey
}

const onboardingTarget = (name: string) => () =>
  globalThis.document?.querySelector<HTMLElement>(`[data-onboarding-target="${name}"]`) ?? null

export function createFeatureEntryOnboardingSteps(translate = (key: string) => key): FeatureEntryOnboardingStep[] {
  return [
    {
      key: 'scope-switcher',
      target: onboardingTarget('scope-switcher'),
      title: translate('PAC.Chat.ClawXpert.EntryGuideScopeTitle'),
      description: translate('PAC.Chat.ClawXpert.EntryGuideScopeDesc'),
      placement: 'rightTop',
      type: 'primary'
    },
    {
      key: 'plugins-marketplace',
      target: onboardingTarget('plugins-marketplace'),
      title: translate('PAC.Chat.ClawXpert.EntryGuidePluginsTitle'),
      description: translate('PAC.Chat.ClawXpert.EntryGuidePluginsDesc'),
      placement: 'rightTop',
      type: 'primary'
    },
    {
      key: 'model-providers',
      target: onboardingTarget('model-providers'),
      title: translate('PAC.Chat.ClawXpert.EntryGuideModelProvidersTitle'),
      description: translate('PAC.Chat.ClawXpert.EntryGuideModelProvidersDesc'),
      placement: 'rightTop',
      type: 'primary'
    },
    {
      key: 'workspace',
      target: onboardingTarget('workspace'),
      title: translate('PAC.Chat.ClawXpert.EntryGuideWorkspaceTitle'),
      description: translate('PAC.Chat.ClawXpert.EntryGuideWorkspaceDesc'),
      placement: 'rightTop',
      type: 'primary'
    }
  ]
}

export function getAvailableFeatureEntryOnboardingSteps(
  steps: FeatureEntryOnboardingStep[]
): FeatureEntryOnboardingStep[] {
  return steps.filter((step) => {
    const target = resolveOnboardingTarget(step.target)

    if (!target?.isConnected) {
      return false
    }

    const style = globalThis.window?.getComputedStyle?.(target)
    return style?.display !== 'none' && style?.visibility !== 'hidden'
  })
}

export function isFeatureEntryOnboardingBlocked() {
  return !!globalThis.document?.querySelector('.cdk-dialog-container')
}

export function isFeatureEntryOnboardingScopeStep(step: FeatureEntryOnboardingStep | null | undefined) {
  return step?.key === 'scope-switcher'
}

export function shouldShowFeatureEntryOnboardingForXpertCount(
  xpertCount: number | null | undefined,
  manuallyRequested = false
) {
  return manuallyRequested || xpertCount === 0
}

export function hasFeatureEntryOnboardingAutoShown(preferences: IUserOrganizationPreferences | null | undefined) {
  return !!preferences?.entryGuides?.[FEATURE_ENTRY_ONBOARDING_GUIDE_KEY]?.autoShownAt
}

export function shouldCreateClawXpertAfterEntryOnboarding(
  xpertCount: number | null | undefined,
  canCreateXpert = true
) {
  return canCreateXpert && xpertCount === 0
}

export function getFeatureEntryOnboardingFinishText(xpertCount: number | null | undefined, canCreateXpert = true) {
  return shouldCreateClawXpertAfterEntryOnboarding(xpertCount, canCreateXpert)
    ? 'PAC.Chat.ClawXpert.EntryGuideCreate'
    : 'PAC.ACTIONS.Done'
}

export function shouldExpandSidebarForEntryOnboarding(defaultCollapsed: boolean, entryOnboardingVisible: boolean) {
  return entryOnboardingVisible ? false : defaultCollapsed
}

export function getFeatureEntryOnboardingOpenDelayMs(defaultCollapsed: boolean) {
  return defaultCollapsed ? FEATURE_ENTRY_ONBOARDING_SIDEBAR_EXPAND_DELAY_MS : 0
}

export function shouldAdvanceFeatureEntryOnboardingAfterScopeChange(
  previousScopeLevel: RequestScopeLevel,
  nextScopeLevel: RequestScopeLevel,
  currentStep: FeatureEntryOnboardingStep | null | undefined
) {
  return (
    previousScopeLevel === RequestScopeLevel.TENANT &&
    nextScopeLevel === RequestScopeLevel.ORGANIZATION &&
    isFeatureEntryOnboardingScopeStep(currentStep)
  )
}

function resolveOnboardingTarget(target: ZardHighlightTarget): HTMLElement | null {
  const value = typeof target === 'function' ? target() : target
  if (!value) {
    return null
  }

  if (isElementRef(value)) {
    return value.nativeElement
  }

  return value
}

function isElementRef(value: HTMLElement | ElementRef<HTMLElement>): value is ElementRef<HTMLElement> {
  return typeof value === 'object' && value !== null && 'nativeElement' in value
}
