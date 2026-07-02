import { IBasePerTenantAndOrganizationEntityModel } from './base-entity.model'
import { LanguagesEnum, IUser } from './user.model'

export interface IUserOrganizationPreferences {
  defaultWorkspaceId?: string | null
  entryGuides?: IUserOrganizationEntryGuidePreferences | null
}

export const USER_ORGANIZATION_ENTRY_GUIDE_CLAWXPERT = 'clawxpert'

export type IUserOrganizationEntryGuideKey = typeof USER_ORGANIZATION_ENTRY_GUIDE_CLAWXPERT

export interface IUserOrganizationEntryGuidePreference {
  autoShownAt?: string | null
}

export interface IUserOrganizationEntryGuidePreferences {
  clawxpert?: IUserOrganizationEntryGuidePreference | null
}

export function isUserOrganizationEntryGuideKey(value: string): value is IUserOrganizationEntryGuideKey {
  return value === USER_ORGANIZATION_ENTRY_GUIDE_CLAWXPERT
}

export interface IUserOrganization extends IBasePerTenantAndOrganizationEntityModel {
  userId: string
  isDefault: boolean
  isActive: boolean
  preferences?: IUserOrganizationPreferences | null
  user?: IUser
}

export interface IUserOrganizationFindInput extends IBasePerTenantAndOrganizationEntityModel {
  id?: string
  userId?: string
  isDefault?: boolean
  isActive?: boolean
}

export interface IUserOrganizationCreateInput extends IBasePerTenantAndOrganizationEntityModel {
  userId: string
  isDefault?: boolean
  isActive?: boolean
}

export interface IUserOrganizationDeleteInput {
  userOrganizationId: string
  requestingUser: IUser
  language?: LanguagesEnum
}
