import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { IStorageFile } from '../storage-file.model'
import { TAvatar } from '../types'
import { IUser } from '../user.model'
import { IXpertToolset } from './xpert-toolset.model'
import { IXpertWorkspace } from './xpert-workspace.model'
import { IXpert } from './xpert.model'

export type TXpertProjectSettings = {
  instruction: string
}
export type TXpertProjectStatus = 'active' | 'deprecated' | 'archived'

export type TXpertProject = {
  name: string
  avatar?: TAvatar
  description?: string
  status: TXpertProjectStatus
  settings?: TXpertProjectSettings
}

/**
 * Expert Project
 */
export interface IXpertProject extends TXpertProject, IBasePerTenantAndOrganizationEntityModel {
  workspaceId?: string
  workspace?: IXpertWorkspace

  // Many to one
  ownerId: string
  owner?: IUser

  // One to many
  xperts?: IXpert[]
  toolsets?: IXpertToolset[]
  members?: IUser[]
  files?: IStorageFile[]
}
