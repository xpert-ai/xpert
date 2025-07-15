import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { ITag } from '../tag-entity.model'
import { ChecklistItem } from '../types'
import { IUser } from '../user.model'
import { Visibility } from '../visibility.model'
import { IBusinessArea } from './business-area'
import { IDataSource } from './data-source'
import { IIndicator } from './indicator'
import { IModelQuery } from './model-query'
import * as MDX from './schema'
import { IStory } from './story'

/**
 * Data agent types
 */
export enum AgentType {
  Local = 'local',
  Browser = 'browser',
  Server = 'server',
  Wasm = 'wasm'
}

/**
 * Preferences of semantic model
 */
export interface ISemanticModelPreferences {
  // Cache
  enableCache?: boolean
  expires?: number
  // preferred Language
  language?: string
  // Expose Xmla service for Semantic Model
  exposeXmla?: boolean
}

/**
 * Model Schema Structured Data
 */
export type TSemanticModelOptions<T> = {
  schema?: T
  settings?: any
}

export type TSemanticModel = {
  key?: string
  name?: string
  description?: string
  type?: string
  agentType?: AgentType

  dataSourceId?: string
  businessAreaId?: string

  catalog?: string
  cube?: string
  // 存放语义元数据
  options?: TSemanticModelOptions<any>

  // Roles
  roles?: Array<IModelRole>
}

export type TSemanticModelDraft<T = any> = TSemanticModel & {
  schema?: T
  settings?: any
  savedAt?: Date

  /**
   * @legacy Table defination for wasm database
   */
  tables?: any[] // Array<TableEntity>
  /**
   * @legacy DB Initialization for wasm database
   */
  dbInitialization?: string
  checklist?: ChecklistItem[]
}

export interface ISemanticModel extends IBasePerTenantAndOrganizationEntityModel, TSemanticModel {
  /**
   * Draft on current version
   */
  draft?: TSemanticModelDraft

  /**
   * Publish date of latest
   */
  publishAt?: Date
  releaseNotes?: string

  tags?: ITag[]
  
  dataSource?: IDataSource
  
  businessArea?: IBusinessArea
  
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
}

/**
 * Types of semantic model
 */
export enum ModelTypeEnum {
  XMLA = 'XMLA',
  SQL = 'SQL'
}

/**
 * Role in semantic model
 */
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

/**
 * Role types
 */
export enum RoleTypeEnum {
  single = 'single',
  union = 'union'
}

/**
 * Status of semantic model
 */
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

export type TVirtualCube = {
  name: string
  caption?: string
  description?: string
  cubeUsages: MDX.CubeUsage[]
  virtualCubeDimensions: MDX.VirtualCubeDimension[]
  virtualCubeMeasures: MDX.VirtualCubeMeasure[]
  calculatedMembers: MDX.CalculatedMember[]
}

export function extractSemanticModelDraft<S>(model: TSemanticModel): TSemanticModelDraft<S> {
  return {
    key: model.key,
    name: model.name,
    description: model.description,
    type: model.type,
    agentType: model.agentType,

    dataSourceId: model.dataSourceId,
    businessAreaId: model.businessAreaId,

    catalog: model.catalog,
    cube: model.cube,
    // 存放语义元数据
    // options: model.options,
    schema: model.options?.schema as S,
    settings: model.options?.settings,
    roles: model.roles,
  }
}