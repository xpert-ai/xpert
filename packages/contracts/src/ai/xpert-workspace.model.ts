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
  capabilities?: TXpertWorkspaceCapabilities
  isTenantShared?: boolean

  // Many to one
  ownerId: string
  owner?: IUser

  // One to many
  xperts?: IXpert[]
  environments?: IEnvironment[]

  members?: IUser[]
}

export type TXpertWorkspaceSettings = {
  access?: {
    visibility?: TXpertWorkspaceVisibility
  }
  system?: {
    kind?: 'org-default' | 'tenant-default' | 'user-default'
    userId?: string
  }
}
export type TXpertWorkspaceStatus = 'active' | 'deprecated' | 'archived'
export type TXpertWorkspaceVisibility = 'private' | 'tenant-shared'

export type TXpertWorkspaceCapabilities = {
  canRead: boolean
  canRun: boolean
  canWrite: boolean
  canManage: boolean
}

export function getXpertWorkspaceVisibility(
  workspace?: Pick<IXpertWorkspace, 'settings'> | null
): TXpertWorkspaceVisibility {
  return workspace?.settings?.access?.visibility === 'tenant-shared'
    ? 'tenant-shared'
    : 'private'
}

export function isTenantSharedXpertWorkspace(
  workspace?: Pick<IXpertWorkspace, 'settings'> | null
): boolean {
  return getXpertWorkspaceVisibility(workspace) === 'tenant-shared'
}

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
