import { ISemanticModel, NgmSemanticModel } from '@metad/cloud/state'
import {
  Cube,
  Dimension,
  EntityType,
  ISlicer,
  Measure,
  Property,
  PropertyDimension,
  PropertyHierarchy,
  Schema,
} from '@metad/ocap-core'
import { IStory, ModelQuery, TSemanticModelDraft, uuid } from '../../../@core'

export { MODEL_TYPE } from '@cloud/app/@shared/model/types'

export enum TOOLBAR_ACTION_CATEGORY {
  WORKSPACE,
  GENERAL,
  DIMENSION,
  HIERARCHY
}

export enum ModelDesignerType {
  model = 'model',
  cube = 'cube',
  property = 'property',
  dimensionUsage = 'dimensionUsage',
  dimension = 'dimension',
  hierarchy = 'hierarchy',
  level = 'level',
  measure = 'measure',
  calculatedMember = 'calculatedMember',
  variable = 'variable',
  cubeAttributes = 'cubeAttributes',
  dimensionAttributes = 'dimensionAttributes',
  hierarchyAttributes = 'hierarchyAttributes',
  levelAttributes = 'levelAttributes',
  measureAttributes = 'measureAttributes',
  calculatedMemberAttributes = 'calculatedMemberAttributes'
}

export interface QueryResult {
  statement: string
  columns?: any[]
  data?: any[]
  preview?: any[]
  error?: string
  stats?: {
    numberOfEntries: number
  }
}

export type SemanticModelState = {
  model: NgmSemanticModel & ISemanticModel
  draft?: TSemanticModelDraft<Schema>
}

export interface ModelQueryState {
  key: string
  origin?: ModelQuery
  query: ModelQuery
  dirty: boolean
  results: QueryResult[]
}

/**
 * @deprecated split model and internal states into store and signals
 * 语义模型 UI State
 */
export interface PACModelState {
  model: NgmSemanticModel
  stories: Array<IStory>
  dataSourceName: string
  currentEntity: string // current entity
  viewEditor: {
    wordWrap: boolean
  }
  /**
   * 对于 SQL DB 做 XMLA 模型的， 这里是原始 SQL 数据库的表结构信息
   */
  // entitySets: Array<EntitySet>
  // substates
  ids: string[] | number[]
  /**
   * @deprecated migrate to new store
   */
  cubes: ModelCubeState[]
  /**
   * @deprecated migrate to new store
   */
  dimensions: ModelDimensionState[]
  /**
   * @deprecated migrate to new store
   */
  activedEntities: Array<ModelCubeState | ModelDimensionState>
  /**
   * @deprecated migrate to new store
   */
  queries?: ModelQueryState[]
}

export enum SemanticModelEntityType {
  CUBE = 'CUBE',
  DIMENSION = 'DIMENSION',
  VirtualCube = 'VirtualCube'
}

export interface SemanticModelEntity {
  type?: SemanticModelEntityType
  id: string
  name: string
  caption?: string
  dirty?: boolean
}

export interface EntityPreview {
  rows: Array<Dimension | Measure>
  columns: Array<Dimension | Measure>
  slicers: Array<ISlicer>
}

/**
 * Cube states
 */
export interface ModelCubeState extends SemanticModelEntity {
  /**
   * Entity Type in schema
   */
  entityType?: EntityType
  /**
   * MDX Cube in schema
   */
  cube: Cube

  // the runtime states
  /**
   * Selected property (dimension | measure | calculatedMember) `ModelDesignerType#__id__`
   */
  selectedProperty?: string
  /**
   * Table fields for dimension role
   */
  dimensions?: Property[]
  /**
   * Table fields for measure role
   */
  measures?: Property[]
  /**
   * States of data preview table
   */
  preview?: EntityPreview

  /**
   * The current selected calculated member
   */
  // currentCalculatedMember?: string

  /**
   * Query lab in the entity
   */
  queryLab: {
    statement?: string
  }
}

export interface ModelDimensionState extends SemanticModelEntity {
  dimension: PropertyDimension
  currentHierarchyIndex?: number
  currentHierarchy?: PropertyHierarchy
}

/**
 * 初始化 Cube 子状态
 *
 * @param model
 * @returns
 */
export function initEntitySubState(model: TSemanticModelDraft): Array<ModelCubeState> {
  const schema: Schema = model.schema
  return (
    schema?.cubes?.map((cube) => {
      return {
        type: SemanticModelEntityType.CUBE,
        id: cube.__id__ || uuid(),
        name: cube.name,
        caption: cube.caption,
        cube,
        queryLab: {},
        preview: {
          rows: [],
          columns: [],
          slicers: []
        }
      }
    }) || []
  )
}

/**
 * 初始化 Dimension 子状态
 *
 * @param model
 * @returns
 */
export function initDimensionSubState(model: TSemanticModelDraft): Array<ModelDimensionState> {
  const schema: Schema = model.schema
  return (
    schema?.dimensions?.map((dimension) => {
      return {
        type: SemanticModelEntityType.DIMENSION,
        id: dimension.__id__ || uuid(),
        name: dimension.name,
        caption: dimension.caption,
        dimension
      }
    }) || []
  )
}

export enum HierarchyColumnType {
  Key,
  ParentChild,
  Level,
  Name
}

export interface RuntimeProperty extends Property {
  error?: string
}

export type ModelSchemaValueTypes = {
  [ModelDesignerType.hierarchy]: {
    hierarchy: PropertyHierarchy
    dimension: PropertyDimension
  }
}

export enum CdkDragDropContainers {
  Tables = 'pac-model-entitysets',
  Cubes = 'pac-model-cubes',
  ShareDimensions = 'pac-model-dimensions',
  VirtualCubes = 'pac-model-virtual-cubes',
  HierarchyTable = 'pac-model-dimension__hierarchy-tables',
  QueryEntity = 'pac-model__query-entities',
  Dimensions = 'list-dimensions',
  Measures = 'list-measures',
  CalculatedMembers = 'list-calculated-members',
  CubeSchema = 'pac-model-cube-schema',
}
