import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { ITag } from '../tag-entity.model'
import { ChecklistItem, IPoint, ISize } from '../types'
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
export type TSemanticModelOptions<T = any /*Schema*/> = {
  /**
   * The schema for MDX cube, dimension and virtual cube
   */
  schema?: T
  settings?: TSemanticModelSettings
  /**
   * Is embedded members of every `cube:dimension`
   * Be cleaned up when publish
   */
  embedded?: Record<string, Record<string, boolean>>
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
  // Storing semantic metadata
  options?: TSemanticModelOptions<any>

  // Roles
  roles?: Array<IModelRole>
}

/**
 * Common settings for semantic model space
 */
export type TSemanticModelSettings = {
  canvas?: {
    position: IPoint
    scale: number
  };
  nodes?: {key: string; position?: IPoint; size?: ISize}[]
  /**
   * @experimental A hierarchy of intermediate states that are not yet fixed
   */
  hierarchies?: any[] // PropertyHierarchy[]

  /**
   * Ignore unknown property when query model in story
   */
  ignoreUnknownProperty?: boolean
}

export type TSemanticModelDraft<T = any> = TSemanticModel & {
  schema?: T
  settings?: TSemanticModelSettings
  savedAt?: Date
  checklist?: ChecklistItem[]
  version?: number

  /**
   * @legacy Table defination for wasm database
   */
  tables?: any[] // Array<TableEntity>
  /**
   * @legacy DB Initialization for wasm database
   */
  dbInitialization?: string

  // Is embedded every `cube:dimension`
  embedded?: Record<string, Record<string, boolean>>
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
  
  // Storing model configuration
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

  version?: number
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

export interface ISemanticModelCache extends IBasePerTenantAndOrganizationEntityModel {
  key: string
  language?: string
  modelId?: string
  model?: ISemanticModel
  query?: string
  data?: string
}


/**
 * @deprecated Equivalent to `VirtualCube` in the ocap framework
 */
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
    schema: model.options?.schema as S,
    settings: model.options?.settings,
    roles: model.roles,
  }
}