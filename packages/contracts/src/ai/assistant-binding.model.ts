import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { IUser } from '../user.model'

export enum AssistantCode {
  CHAT_COMMON = 'chat_common',
  XPERT_SHARED = 'xpert_shared',
  CHATBI = 'chatbi',
  CLAWXPERT = 'clawxpert'
}

export enum AssistantBindingScope {
  TENANT = 'tenant',
  ORGANIZATION = 'organization',
  USER = 'user'
}

export enum AssistantBindingSourceScope {
  NONE = 'none',
  TENANT = 'tenant',
  ORGANIZATION = 'organization'
}

export type AssistantManagement = 'system' | 'user'

export interface IAssistantBinding extends IBasePerTenantAndOrganizationEntityModel {
  code: AssistantCode
  scope: AssistantBindingScope
  assistantId?: string | null
  enabled?: boolean | null
  userId?: string | null
  user?: IUser
  preferences?: IAssistantBindingUserPreference[]
}

export interface IAssistantBindingUserPreference extends IBasePerTenantAndOrganizationEntityModel {
  assistantBindingId: string
  assistantBinding?: IAssistantBinding
  userId?: string | null
  user?: IUser
  soul?: string | null
  profile?: string | null
}

export interface IResolvedAssistantBinding extends IAssistantBinding {
  sourceScope: AssistantBindingSourceScope
}

export interface IAssistantBindingUpsertInput {
  code: AssistantCode
  scope: AssistantBindingScope
  assistantId?: string | null
  enabled?: boolean
}

export interface IAssistantBindingUserPreferenceUpsertInput {
  scope: AssistantBindingScope
  soul?: string | null
  profile?: string | null
}

const USER_MANAGED_ASSISTANTS = new Set<AssistantCode>([AssistantCode.CLAWXPERT])

export function getAssistantManagement(code: AssistantCode): AssistantManagement {
  return USER_MANAGED_ASSISTANTS.has(code) ? 'user' : 'system'
}

export function isUserManagedAssistant(code: AssistantCode): boolean {
  return getAssistantManagement(code) === 'user'
}

export function isSystemManagedAssistant(code: AssistantCode): boolean {
  return getAssistantManagement(code) === 'system'
}
