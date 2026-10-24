import type { IOrganization } from './organization.model'
import type { IUser, UserType } from './user.model'

export type UserDirectoryStatus = 'all' | 'active' | 'disabled'

export interface IUserDirectoryQuery {
  take?: number
  skip?: number
  search?: string
  types?: UserType[]
  roles?: string[]
  status?: UserDirectoryStatus
  organizationIds?: string[]
}

export interface IUserDirectoryItem extends IUser {
  displayOrganizations: IOrganization[]
}
