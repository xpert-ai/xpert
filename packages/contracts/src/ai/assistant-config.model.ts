import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'

export enum AssistantCode {
  XPERT_SHARED = 'xpert_shared',
  CHATBI = 'chatbi'
}

export enum AssistantConfigScope {
  TENANT = 'tenant',
  ORGANIZATION = 'organization'
}

export enum AssistantConfigSourceScope {
  NONE = 'none',
  TENANT = 'tenant',
  ORGANIZATION = 'organization'
}

export type AssistantConfigOptions = {
  assistantId: string
  frameUrl: string
}

export interface IAssistantConfig extends IBasePerTenantAndOrganizationEntityModel {
  code: AssistantCode
  enabled: boolean
  options?: AssistantConfigOptions | null
}

export interface IResolvedAssistantConfig extends IAssistantConfig {
  sourceScope: AssistantConfigSourceScope
}

export interface IAssistantConfigUpsertInput {
  code: AssistantCode
  scope: AssistantConfigScope
  enabled: boolean
  options?: AssistantConfigOptions | null
}
