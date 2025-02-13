import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { ITag } from '../tag-entity.model'
import { IUser } from '../user.model'
import { Visibility } from '../visibility.model'
import { IBusinessArea } from './business-area'
import { IDataSource } from './data-source'
import { IIndicator } from './indicator'
import { IModelQuery } from './model-query'
import * as MDX from './schema'
import { IStory } from './story'

export enum AgentType {
  Local = 'local',
  Browser = 'browser',
  Server = 'server',
  Wasm = 'wasm'
}

export interface ISemanticModelPreferences {
  // Cache
  enableCache?: boolean
  expires?: number
  // preferred Language
  language?: string
  // Expose Xmla service for Semantic Model
  exposeXmla?: boolean
}

export interface ISemanticModel extends IBasePerTenantAndOrganizationEntityModel {
  key?: string
  name?: string
  description?: string
  type?: string
  agentType?: AgentType
  tags?: ITag[]

  dataSourceId?: string
  dataSource?: IDataSource

  businessAreaId?: string
  businessArea?: IBusinessArea

  catalog?: string
  cube?: string
  // 存放语义元数据
  options?: {
    schema?: MDX.Schema
    settings?: any
  }
  // 存放模型配置
  preferences?: ISemanticModelPreferences

  visibility?: Visibility

  status?: SemanticModelStatusEnum
  /**
   * Model owner, can be transfered
   */
  owner?: IUser
  ownerId?: string

  members?: IUser[]
  // Stories
  stories?: Array<IStory>
  // Indicators
  indicators?: Array<IIndicator>
  // Query
  queries?: Array<IModelQuery>
  // Roles
  roles?: Array<IModelRole>
}

export enum ModelTypeEnum {
  XMLA = 'XMLA',
  SQL = 'SQL'
}

export interface IModelRole extends IBasePerTenantAndOrganizationEntityModel {
  modelId: string
  model?: ISemanticModel
  key: string
  name: string
  type?: null | '' | RoleTypeEnum
  options: MDX.Role
  index?: number
  users?: IUser[]
}

export enum RoleTypeEnum {
  single = 'single',
  union = 'union'
}

export enum SemanticModelStatusEnum {
  /**
   * Using
   */
  Progressing = 'progressing',

  /**
   * Archived
   */
  Archived = 'archived'
}
