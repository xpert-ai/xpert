/**
 * Here is the intermediate type definition converted from the actual schema type to the xmla file format.
 * But the type definition here can also be referenced by the actual schema definition.
 */

export interface Schema {
  name: string
  description?: string
  Cube: Cube[]
  VirtualCube?: VirtualCube[]
  Dimension?: Dimension[]
  Role?: Role[]
}

export interface Cube {
  __id__?: string
  name: string
  caption?: string
  Table: Table[] | Table
  View: View[] | View
  DimensionUsage?: DimensionUsage[]
  Dimension: Dimension[]
  Measure: Measure[]
  CalculatedMember?: CalculatedMember[]
}

export interface Table {
  name: string
}

export interface View extends SQLExpression {
  alias: string
  _?: string
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

export interface Dimension {
  __id__?: string
  name: string
  label?: string
  foreignKey?: string
  type?: DimensionType
  caption?: string
  description?: string
  Hierarchy: Hierarchy[]
}

export interface DimensionUsage {
  __id__?: string
  name: string
  source: string
  foreignKey: string
  caption?: string
  description?: string
}

export interface Hierarchy {
  __id__?: string
  name?: string
  label?: string
  hasAll: boolean
  allMemberName?: string
  defaultMember?: string
  primaryKey: string
  primaryKeyTable?: string
  Table?: Table[] | Table
  Level?: Level[]
  Join?: Join
}

export interface Level {
  __id__?: string
  name: string
  label?: string
  column: string
  nameColumn?: string
  ordinalColumn?: string
  parentColumn?: string
  nullParentValue?: number
  uniqueMembers: boolean
  type?: string
  table?: string
  Closure?: Closure
  KeyExpression?: KeyExpression
  NameExpression?: NameExpression
  CaptionExpression?: CaptionExpression
  OrdinalExpression?: OrdinalExpression
  ParentExpression?: ParentExpression
  Property?: Property[]
}

export interface SQLExpression {
  SQL: SQL | SQL[]
}

export interface KeyExpression {
  SQL: SQL
}

export interface NameExpression {
  SQL: SQL
}

export interface CaptionExpression {
  SQL: SQL
}

export interface OrdinalExpression {
  SQL: SQL
}

export interface ParentExpression {
  SQL: SQL
}

export interface SQL {
  dialect: string
  _?: string
}

export interface Property {
  name: string
  column: string
  PropertyExpression?: SQLExpression
}

export interface Closure {
  parentColumn: string
  childColumn: string
  Table: Table
}

export interface Measure {
  __id__?: string
  name: string
  caption?: string
  label?: string
  column: string
  aggregator: string
  formatString?: string
  MeasureExpression?: MeasureExpression
}

export interface MeasureExpression {
  SQL: SQL
}

export interface CalculatedMember {
  __id__?: string
  name: string
  caption?: string
  description?: string
  dimension?: string
  hierarchy?: string
  formula: string
  Formula?: string[]
  parent?: string
  visible?: boolean
  CalculatedMemberProperty?: CalculatedMemberProperty[]
}

export interface CalculatedMemberProperty {
  name: string
  caption?: string
  description?: string
  expression?: string
  value: string
}

export interface NamedSet {
  name: string
  caption?: string
  description?: string
  formula?: string
  Formula?: string[]
}

export interface Join {
  leftKey?: string
  rightAlias?: string
  rightKey?: string
  Table?: Table | Table[]
  Join?: Join
}

// VirtualCube
export interface VirtualCube {
  name: string
  caption?: string
  description?: string
  CubeUsages: {
    CubeUsage: CubeUsage[] | CubeUsage
  }
  VirtualCubeDimension: VirtualCubeDimension[] | VirtualCubeDimension
  VirtualCubeMeasure: VirtualCubeMeasure[] | VirtualCubeMeasure
  CalculatedMember: CalculatedMember[] | CalculatedMember
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

export interface Role {
  name: string
  SchemaGrant?: SchemaGrant[]
  schemaGrant?: SchemaGrant
  // Union roles
  roleUsages?: string[]
}

/**
 * enumerates the allowable access rights.
 */
export enum Access {
  /**
   * No access to an object and its children.
   */
  none = 'none',
  /**
   * A grant that covers none of the children unless explicitly granted.
   */
  custom = 'custom',
  /**
   * Access to all shared dimensions (applies to schema grant).
   */
  all_dimensions = 'all_dimensions',
  /**
   * All access to an object and its children.
   */
  all = 'all',
}

export enum RollupPolicy {
  full = 'full',
  partial = 'partial',
  hidden = 'hidden'
}

export interface SchemaGrant {
  access: Access
  cubeGrants: CubeGrant[]
}

export interface CubeGrant {
  cube: string
  access: Access
  hierarchyGrants: HierarchyGrant[]
}

export interface HierarchyGrant {
  hierarchy: string
  caption?: string
  access: Access
  rollupPolicy: RollupPolicy
  topLevel: string
  topLevelCaption?: string
  bottomLevel: string
  bottomLevelCaption?: string
  memberGrants: MemberGrant[]
}

export interface MemberGrant {
  member: string
  caption?: string
  access: Access
}
