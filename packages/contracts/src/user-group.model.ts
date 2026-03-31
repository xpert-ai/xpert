import { IBasePerTenantAndOrganizationEntityModel } from './base-entity.model'
import { IUser } from './user.model'

export interface IUserGroup extends IBasePerTenantAndOrganizationEntityModel {
  name: string
  description?: string | null
  members?: IUser[]
}
