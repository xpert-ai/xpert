import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { IStorageFile } from '../storage-file.model'
import { IUser } from '../user.model'
import { ICertification } from './certification.model'
import { IIndicator } from './indicator'
import { ISemanticModel } from './semantic-model'
import { IStory } from './story'

export interface IProject extends IBasePerTenantAndOrganizationEntityModel {
  name?: string
  description?: string
  options?: any
  /**
   * Project owner, can be transfered
   */
  owner?: IUser
  ownerId?: string
  status?: ProjectStatusEnum

  stories?: IStory[]
  indicators?: IIndicator[]
  /**
   * Project Members
   */
  members?: IUser[]
  /**
   * Semantic model bound in the project
   */
  models?: ISemanticModel[]
  /**
   * Certifications available in the project
   */
  certifications?: ICertification[]

  /**
   * Files in the project
   */
  files?: IStorageFile[]
}

export enum ProjectStatusEnum {
  /**
   * In use
   */
  Progressing = 'Progressing',

  /**
   * Archived
   */
  Archived = 'Archived'
}

export interface IBasePerProjectEntityModel extends IBasePerTenantAndOrganizationEntityModel {
  projectId?: string
  project?: IProject
}
