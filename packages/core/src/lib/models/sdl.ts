import { Semantics } from '../annotations'
import { Annotation, IMember, Measure, PrimitiveType, PropertyName, Syntax } from '../types'
import { CalculatedMember, CalculationProperty, CubeParameterEnum, ParameterControlEnum } from './calculated'
import { Indicator } from './indicator'
import { AggregationRole, EntityProperty, PropertyAttributes, PropertySemantics } from './property'

/**
 * Base type for all entity types
 */
export interface Entity {
  /**
   * Catalog of entity
   */
  catalog?: string
  /**
   * Name of entity
   */
  name: string
  /**
   * Caption for entity
   */
  caption?: string

  /**
   * Visible Property
   */
  visible?: boolean
  /**
   * Long text description of entity
   */
  description?: string
}

export interface Schema {
  name: string
  /**
   * Semantic Model Cubes
   */
  cubes?: Cube[]
  /**
   * Virtual Cubes
   */
  virtualCubes?: VirtualCube[]
  /**
   * Semantic Model Dimensions
   */
  dimensions?: PropertyDimension[]
  annotations?: any[]
  functions?: any[]
  indicators?: Array<Indicator>
  /**
   * Runtime EntitySet
   */
  entitySets?: {
    [key: string]: EntitySet
  }
}

export interface Cube extends Entity {
  __id__?: string
  expression?: string
  /**
   * @deprecated use `table` in `fact` attribute
   */
  tables?: Table[]
  fact?: {
    type?: 'table' | 'view',
    table?: Table
    view?: View
    // views?: View[] // Not supported yet
  }
  dimensionUsages?: DimensionUsage[]
  dimensions?: PropertyDimension[]
  measures?: PropertyMeasure[]
  calculatedMembers?: CalculatedMember[]
  defaultMeasure?: string
  
  /**
   * @experimental Enhanced calculation measures
   */
  calculations?: CalculationProperty[]
  /**
   * @experimental Cube variables from third-party systems
   */
  variables?: VariableProperty[]
  /**
   * @experimental Enhanced parameters
   */
  parameters?: ParameterProperty[]
}

export interface SQL {
  dialect?: string
  content?: string
  _?: string
}

export interface SQLExpression {
  sql: SQL
}

export interface Table {
  __id__?: string
  name: string
  join?: Join
}

export interface View extends SQLExpression {
  __id__?: string
  alias?: string
}

export interface Join {
  type: 'Left' | 'Inner' | 'Right'
  leftTable?: string
  fields: JoinField[]
  rightAlias?: string

  tables?: Array<Table>

  leftKey?: string
  rightKey?: string
}

export interface JoinField {
  leftKey: string
  rightKey: string
}

export type KeyExpression = SQLExpression
export type NameExpression = SQLExpression
export type CaptionExpression = SQLExpression

export interface DimensionUsage {
  __id__?: string
  name: string
  source: string
  foreignKey: string
  caption?: string
  description?: string
}

/**
 */
export enum EntitySemantics {
  aggregate = 'aggregate',
  parameters = 'parameters',
  table = 'table',
  view = 'view'
}

/**
 * Entity Type definition
 */
export interface EntityType extends Entity {
  /**
   * Entity primary keys
   */
  keys?: string[]

  // entity type 属性们
  properties: {
    [name: string]: Property
  }

  /**
   * the input parameters to query Entity, usually required fields
   */
  parameters?: {
    [name: string]: ParameterProperty
  }

  /**
   * @deprecated 应该移到 EntitySet 里
   */
  indicators?: Array<Indicator>

  // Data Source Dialect
  dialect?: any // string
  // Data Source query statement syntax
  syntax?: Syntax

  /**
   *
   */
  semantics?: EntitySemantics
  /**
   * Default measure for the cube
   */
  defaultMeasure?: string
  /**
   * Original cube schema
   */
  cube?: Cube
}

/**
 * Mondrian 仅支持三种 Dimension 类型,
 * 更丰富的语义可以通过 Semantics 来定义
 */
export enum DimensionType {
  StandardDimension = 'StandardDimension',
  TimeDimension = 'TimeDimension',
  MeasuresDimension = 'MeasuresDimension'
}

export interface Property extends EntityProperty {
  expression?: string
  /**
   * The foreignKey of Fact table for this property
   */
  foreignKey?: string
  /**
   * The column of Dimension table for this property
   */
  column?: string
  /**
   * 维度类型, 或字段 DB 类型
   */
  type?: DimensionType | string
  description?: string
  hierarchies?: PropertyHierarchy[]
  defaultHierarchy?: string

  /**
   * 维度的属性字段
   */
  properties?: Array<EntityProperty>

  keyExpression?: KeyExpression

  /**
   * @deprecated
   */
  hierarchyNodeFor?: string
  /**
   * @deprecated
   */
  hierarchyLevelFor?: string
  /**
   * @deprecated
   */
  hierarchyParentNodeFor?: string

  dimensionOrdinal?: number
}

export type PropertyDimension = Property

export interface PropertyMeasure extends EntityProperty {
  formatting?: Measure['formatting']
  column?: string
  aggregator?: string
  formatString?: string
  /**
   * SQL Expression for measure
   */
  measureExpression?: SQLExpression
}

export interface PropertyHierarchy extends EntityProperty {
  tables?: Table[]
  join?: Join
  hasAll?: boolean
  allMemberName?: string
  allMemberCaption?: string
  allLevelName?: string
  primaryKey?: string
  primaryKeyTable?: string

  hierarchyCardinality?: number

  /**
   * 默认成员, 当上线文没有设置此维度的成员时默认取此成员
   */
  defaultMember?: string
  /**
   * 根成员, 代表所有值的汇总
   *
   * @deprecated should calculate from `hasAll` `allMemberName`
   */
  allMember?: string
  levels?: Array<PropertyLevel>
}

export enum TimeLevelType {
  TimeYears = 'TimeYears',
  TimeQuarters = 'TimeQuarters',
  TimeMonths = 'TimeMonths',
  TimeWeeks = 'TimeWeeks',
  TimeDays = 'TimeDays'
}

/**
 * Runtime level type
 * Type of the level:
 * https://docs.microsoft.com/en-us/previous-versions/sql/sql-server-2012/ms126038(v=sql.110)
 * https://github.com/OpenlinkFinancial/MXMLABridge/blob/master/src/custom/mondrian/xmla/handler/RowsetDefinition.java
 */
export enum RuntimeLevelType {
  REGULAR = 0,
  ALL = 1,
  CALCULATED = 2,
  // GEO_CONTINENT = 1,
  TIME_YEAR = 20,
  TIME_QUARTER = 68,
  TIME_MONTH = 132,
  TIME_WEEK = 260,
  TIME_DAY = 516
}

type ColumnType = 'String' | 'Integer' | 'Numeric' | 'Boolean' | 'Date' | 'Time' | 'Timestamp'

export interface PropertyLevel extends EntityProperty {
  hierarchy?: PropertyName
  column?: string
  nameColumn?: string
  captionColumn?: string
  ordinalColumn?: string
  parentColumn?: string
  nullParentValue?: string
  uniqueMembers?: boolean
  type?: ColumnType
  table?: string
  closure?: Closure

  levelNumber?: number
  levelCardinality?: number
  /**
   * The type of level, such as 'TimeYears', 'TimeMonths', 'TimeDays' if dimension is a time dimension
   */
  levelType?: TimeLevelType | RuntimeLevelType | string
  /**
   * Properties of members in the level
   */
  properties?: Array<LevelMemberProperty>
  // hierarchyLevelFor?: PropertyName
  parentChild?: boolean

  keyExpression?: KeyExpression
  nameExpression?: NameExpression
  captionExpression?: CaptionExpression
  ordinalExpression?: SQLExpression
  parentExpression?: SQLExpression

  /**
   * Level semantics (hiddenProperties)
   */
  semantics?: PropertySemantics & {
    hiddenProperties?: boolean
  }
}

/**
 * Member property.
 * 
 * Member properties are defined by the <Property> element within a <Level>, like this:
 * ```xml
 * <Level name="MyLevel" column="LevelColumn" uniqueMembers="true">
 *   <Property name="MyProp" column="PropColumn" type="Numeric"/>
 * </Level>
 * ```
 */
export interface LevelMemberProperty extends PropertyAttributes {
  column?: string
  type?: ColumnType
  propertyExpression?: SQLExpression
}

export interface ParameterProperty extends EntityProperty {
  paramType: CubeParameterEnum | ParameterControlEnum
  value?: PrimitiveType | IMember[]

  // Candidate Members
  availableMembers?: Array<IMember>
  
  hierarchy?: string
  /**
   * Single or multiple selection of parameter's members
   */
  multiple?: boolean
}

// SAP Variables
export enum VariableEntryType {
  Default,
  Required,
  Optional
}
export enum VariableSelectionType {
  Default,
  Value,
  Interval,
  Complex
}

export interface VariableProperty extends ParameterProperty {
  // sap variables
  referenceDimension?: string
  referenceHierarchy: string
  defaultHigh: string
  defaultHighCaption: string
  defaultLow: string
  defaultLowCaption: string
  variableCaption: string
  variableEntryType: VariableEntryType
  variableGuid: string
  variableName: string
  variableOrdinal: number
  variableProcessingType: number
  variableSelectionType: VariableSelectionType
  variableType: number
}

/**
 *
 * Entity 的 Meta 信息集合
 */
export interface EntitySet extends Entity {
  __id__?: string

  /**
   * Entity Type 定义
   */
  entityType?: EntityType

  annotations?: Array<Annotation>

  indicators?: Array<Indicator>

  /**
   * Is annotated cube
   */
  annotated?: boolean
}

export interface MDCube extends EntitySet {
  cubeType?: string
  cubeCaption?: string
}

export interface Catalog {
  name: string
  label: string
}

export interface Closure {
  parentColumn: string
  childColumn: string
  table: Table
}

export interface CubeUsage {
  cubeName: string
  ignoreUnrelatedDimensions?: boolean
}

export interface VirtualCubeDimension {
  cubeName: string
  cubeCaption?: string
  __shared__?: boolean
  name: string
  /**
   * @deprecated use caption
   */
  label?: string
  caption?: string
}

export interface VirtualCubeMeasure {
  cubeName: string
  cubeCaption?: string
  name: string
  /**
   * @deprecated use caption
   */
  label?: string
  caption?: string
  visible: boolean
}


export interface VirtualCube {
  __id__?: string
  name: string
  caption?: string
  description?: string
  cubeUsages: CubeUsage[]
  virtualCubeDimensions: VirtualCubeDimension[]
  virtualCubeMeasures: VirtualCubeMeasure[]
  calculatedMembers: CalculatedMember[]
}

// type Guards
export const isVariableProperty = (toBe): toBe is VariableProperty => toBe?.role === AggregationRole.variable