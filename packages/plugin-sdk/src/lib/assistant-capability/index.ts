import { applyDecorators, Injectable, SetMetadata } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import type { I18nObject, LanguagesEnum, ModelFeature, TXpertTeamDraft, TXpertTemplate } from '@xpert-ai/contracts'
import { BaseStrategyRegistry } from '../strategy'
import { STRATEGY_META_KEY } from '../types'

export interface AssistantCapabilityContext {
  template: TXpertTemplate
  draft: TXpertTeamDraft
  language: LanguagesEnum
  /** Provided again at installation; providers must not silently select a fallback. */
  sandboxProviders?: { type: string }[]
}

export interface AssistantCapabilityApplyContext extends AssistantCapabilityContext {
  loadTemplate: (id: string) => Promise<TXpertTemplate>
}

/** Optional capabilities default to off. IDs are stable machine-readable keys. */
export interface IAssistantCapabilityProvider {
  readonly key: string
  readonly label: string | I18nObject
  readonly description: string | I18nObject
  readonly requiredModelFeatures?: ModelFeature[]
  /** Explicitly opt into the blank Assistant creation flow. */
  readonly availableForBlankAssistant?: boolean
  /** Distribution extensions to specific templates, without changing their portable source. */
  readonly templates?: { templateId: string; required: boolean }[]
  /** Detect a capability already owned by the base workflow; it cannot be removed by a new overlay. */
  isEnabled?(draft: TXpertTeamDraft): boolean
  check(context: AssistantCapabilityContext): Promise<{ available: boolean; reason?: string }>
  /** Deterministic draft composition; never creates external resources. */
  apply(context: AssistantCapabilityApplyContext): Promise<void>
}

export const ASSISTANT_CAPABILITY_PROVIDER = 'ASSISTANT_CAPABILITY_PROVIDER'
export const AssistantCapabilityProvider = (key: string) =>
  applyDecorators(
    SetMetadata(ASSISTANT_CAPABILITY_PROVIDER, key),
    SetMetadata(STRATEGY_META_KEY, ASSISTANT_CAPABILITY_PROVIDER)
  )

@Injectable()
export class AssistantCapabilityProviderRegistry extends BaseStrategyRegistry<IAssistantCapabilityProvider> {
  constructor(discovery: DiscoveryService, reflector: Reflector) {
    super(ASSISTANT_CAPABILITY_PROVIDER, discovery, reflector)
  }
}
