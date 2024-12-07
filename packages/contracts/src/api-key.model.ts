import { IBasePerTenantAndOrganizationEntityModel } from './base-entity.model'

export interface IApiKey extends IBasePerTenantAndOrganizationEntityModel {
  token: string
  name?: string
  type?: string
  entityId?: string
  validUntil?: Date
  expired?: boolean
  lastUsedAt?: Date
}
