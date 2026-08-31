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
    kind?: 'org-default' | 'tenant-default' | 'user-default' | 'plugin-app'
    userId?: string
    pluginName?: string
    appName?: string
  }
}
export type TXpertWorkspaceStatus = 'active' | 'deprecated' | 'archived'
/**
 * Authoring visibility of a workspace.
 * `organization-shared` grants current organization members access without
 * materializing a membership row for every existing or future member.
 */
export type TXpertWorkspaceVisibility = 'private' | 'tenant-shared' | 'organization-shared'
export type TXpertWorkspaceAccessPurpose = 'runtime' | 'authoring'

export type TXpertWorkspaceCapabilities = {
  canRead: boolean
  canRun: boolean
  canWrite: boolean
  canManage: boolean
}

/** Normalizes missing or unknown persisted values to the secure `private` default. */
export function getXpertWorkspaceVisibility(
  workspace?: Pick<IXpertWorkspace, 'settings'> | null
): TXpertWorkspaceVisibility {
  const visibility = workspace?.settings?.access?.visibility
  return visibility === 'tenant-shared' || visibility === 'organization-shared' ? visibility : 'private'
}

export function isTenantSharedXpertWorkspace(workspace?: Pick<IXpertWorkspace, 'settings'> | null): boolean {
  return getXpertWorkspaceVisibility(workspace) === 'tenant-shared'
}

/**
 * Returns whether an organization workspace is intentionally shared with all
 * current organization members instead of an explicit member list.
 */
export function isOrganizationSharedXpertWorkspace(workspace?: Pick<IXpertWorkspace, 'settings'> | null): boolean {
  return getXpertWorkspaceVisibility(workspace) === 'organization-shared'
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
