import { IBasePerTenantAndOrganizationEntityModel } from './base-entity.model'
import { IUser } from './user.model'

export enum UserGroupManagedByEnum {
  XPERT_MARKETPLACE = 'xpert-marketplace'
}

export enum UserGroupManagedEntityTypeEnum {
  XPERT = 'xpert'
}

export interface IUserGroup extends IBasePerTenantAndOrganizationEntityModel {
  name: string
  description?: string | null
  members?: IUser[]
  managedBy?: UserGroupManagedByEnum | null
  managedEntityType?: UserGroupManagedEntityTypeEnum | null
  managedEntityId?: string | null
}
