import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { IStorageFile } from '../storage-file.model'
import { TAvatar } from '../types'
import { IUser } from '../user.model'
import { IXpert } from './xpert.model'

/**
 * Expert Project
 */
export interface IXpertProject extends IBasePerTenantAndOrganizationEntityModel {
  name: string
  avatar?: TAvatar
  description?: string
  status: TXpertProjectStatus
  settings?: TXpertProjectSettings

  // Many to one
  ownerId: string
  owner?: IUser

  // One to many
  xperts?: IXpert[]
  members?: IUser[]
  files?: IStorageFile[]
}

export type TXpertProjectSettings = {
  instruction: string
}
export type TXpertProjectStatus = 'active' | 'deprecated' | 'archived'
