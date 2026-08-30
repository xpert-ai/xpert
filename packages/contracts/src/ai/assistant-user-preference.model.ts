import type { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import type { IUser } from '../user.model'
import type { IXpert } from './xpert.model'

export const ASSISTANT_USER_PREFERENCES_VERSION = 1 as const

export type TAssistantModelSelectionPreference = {
  selectedModelId: string
}

/**
 * Typed preference domains stored for one user and one Assistant.
 * Add future Assistant-scoped preference domains here instead of creating
 * another single-purpose preference entity.
 */
export type TAssistantUserPreferenceDomainMap = {
  modelSelection: TAssistantModelSelectionPreference
}

export type TAssistantUserPreferenceDomain = keyof TAssistantUserPreferenceDomainMap

export type TAssistantUserPreferences = {
  version: typeof ASSISTANT_USER_PREFERENCES_VERSION
} & Partial<TAssistantUserPreferenceDomainMap>

export interface IAssistantUserPreference extends IBasePerTenantAndOrganizationEntityModel {
  assistantId: string
  assistant?: IXpert
  userId: string
  user?: IUser
  preferences: TAssistantUserPreferences
}
