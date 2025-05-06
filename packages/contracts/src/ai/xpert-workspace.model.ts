import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { IUser } from '../user.model'
import { IEnvironment } from './environment.model'
import { IXpert } from './xpert.model'

/**
 * Expert Workspace
 */
export interface IXpertWorkspace extends IBasePerTenantAndOrganizationEntityModel {
  name: string
  description?: string
  status: TXpertWorkspaceStatus
  settings?: TXpertWorkspaceSettings

  // Many to one
  ownerId: string
  owner?: IUser

  // One to many
  xperts?: IXpert[]
  environments?: IEnvironment[]

  members?: IUser[]
}

export type TXpertWorkspaceSettings = {
  //
}
export type TXpertWorkspaceStatus = 'active' | 'deprecated' | 'archived'

export interface IBasePerWorkspaceEntityModel extends IBasePerTenantAndOrganizationEntityModel {
  workspaceId?: string
  workspace?: IXpertWorkspace
  /**
   * Publish date of latest
   */
  publishAt?: Date
  /**
   * Soft deleted
   */
  deletedAt?: Date
}
