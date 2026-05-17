import { IBasePerTenantAndOrganizationEntityModel } from './base-entity.model'

export enum SecretTokenBindingType {
  API_KEY = 'api_key',
  PUBLIC_XPERT = 'public_xpert'
}

export interface ISecretToken extends IBasePerTenantAndOrganizationEntityModel {
  entityId?: string
  type?: SecretTokenBindingType
  token: string
  validUntil?: Date
  expired?: boolean
}

export interface ISecretTokenFindInput extends IBasePerTenantAndOrganizationEntityModel {
  entityId?: string
  type?: SecretTokenBindingType
  token?: string
}
