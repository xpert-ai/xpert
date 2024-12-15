import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'

export interface ICopilotStore extends TCopilotStore, IBasePerTenantAndOrganizationEntityModel {}

export interface ICopilotStoreVector extends TCopilotStoreVector, IBasePerTenantAndOrganizationEntityModel {
}

export type TCopilotStore = {
  prefix: string
  key: string
  value: any
}

export type TCopilotStoreVector = {
  prefix: string
  key: string
  field_name: any
  embedding: string
}
