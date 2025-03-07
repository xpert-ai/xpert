import { v4 as uuidv4 } from 'uuid'
import { OrderBy, OrderDirection } from './orderby'
import { formatNumber, formatShortNumber, isNil, isString, strToNumber } from './utils/index'
import { CalculatedProperty } from './models'

export type HttpHeaders = { [key: string]: string | string[] }
export type PrimitiveType = number | string | boolean | null | undefined
export type UUID = string
export type PropertyName = string
export const C_MEASURES = 'Measures'
export const CAPTION_FIELD_SUFFIX = '_Text'
export const C_MEASURES_CAPTION = `[${C_MEASURES}]${CAPTION_FIELD_SUFFIX}`


export enum Syntax {
  SQL = 'SQL',
  JSON = 'JSON',
  MDX = 'MDX'
}

export interface IMember {
  key: string
  caption?: string
  /**
   * @deprecated use caption
   */
  label?: string
  /**
   * @deprecated use key
   */
  value?: PrimitiveType
}

export enum DisplayBehaviour {
  descriptionAndId = 'descriptionAndId',
  descriptionOnly = 'descriptionOnly',
  idAndDescription = 'idAndDescription',
  idOnly = 'idOnly',
  auto = ''
}

export type Member = PropertyName | IMember

export type BaseProperty = {
  dimension?: PropertyName
  /**
   * 如当 Dimension = "Measures" 时可以设置 members 为 ["Gross Margin", "Discount"] 等度量字段名
   * 也可以为 dimension 设置固定的成员
   */
  members?: Member[]
  /**
   * Caption of dimension
   */
  caption?: string
}

export type Dimension = BaseProperty &
  Partial<{
    /**
     * 对 Dimension 信息的分类命名 （有些情况下需要区分相同的 Dimension 的不同用途）
     */
    name: string
    hierarchy: PropertyName
    level: PropertyName

    /**
     * Caption field for dimension
     */
    memberCaption?: PropertyName
    /**
     * 显示为...
     */
    displayBehaviour: DisplayBehaviour

    /**
     * 清除度量全部为 NULL 的成员
     */
    zeroSuppression?: boolean

    /**
     * 是否显示无值数据, 在 MDX 中为 `[#]` 的成员
     */
    unbookedData: boolean
    /**
     * 显示维度为 Hierarchy
     */
    displayHierarchy: boolean
    /**
     * 维度属性字段们
     */
    properties: Array<PropertyName>
    /**
     * 参数名称, 指向 EntityType.parameters
     */
    parameter: string
    /**
     * 排除 members 中的成员
     */
    exclude?: boolean
    /**
     * Order by
     */
    order?: OrderDirection
  }>

/**
 * Measure 字段结构会使用 Dimension 中的 dimension, members, zeroSuppression 属性
 */
export type Measure = BaseProperty & {
  measure: PropertyName
  formatting?: {
    // scale: string
    // scaleFormatting: string
    shortNumber?: boolean
    decimal?: number
    digitsInfo?: string
    // showSignAs: string
    unit?: string
    useUnderlyingUnit?: boolean
    currencyCode?: string
  }

  /**
   * Order by
   */
  order?: OrderDirection
}

/**
 * 全部 Annotation 的抽象接口
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface Annotation {
  id?: string
}

export enum AnnotationTerm {
  RelatedRecursiveHierarchy = 'RelatedRecursiveHierarchy',
  ValueList = 'ValueList',
  SelectionFields = 'SelectionFields'
}

export enum Drill {
  Children, // 子成员, distance 默认为 1
  SelfAndChildren, // 自己和子成员, distance 默认为 1
  Descendants, // 所有后代成员
  SelfAndDescendants, // 自己和所有后代成员
  Siblings, // 自己兄弟成员
  Leaves, // 后代中的叶子成员
  Ancestor // 父级成员, distance 默认为 1
}

export enum FilterSelectionType {
  Multiple = 'Multiple',
  Single = 'Single',
  /**
   * @deprecated use SingleRange only ?
   */
  SingleInterval = 'SingleInterval',
  SingleRange = 'SingleRange'
}

export interface ISlicer {
  dimension?: Dimension
  exclude?: boolean
  members?: IMember[]
  // drill
  drill?: Drill
  // 下钻到的层级距离本节点级数, 默认为 1 即下一级, drill distance of the member
  distance?: number
  selectionType?: FilterSelectionType
}

export enum FilterOperator {
  // All = 'All',
  // Any = 'Any',
  BT = 'BT',
  EQ = 'EQ', //
  GE = 'GE', //
  GT = 'GT', //
  LE = 'LE', //
  LT = 'LT', //
  /**
   * FilterOperator "Not Between"
   * Used to filter all entries, which are not between the given boundaries.
   * The filter result does not contains the boundaries,
   * but only entries outside of the boundaries.
   * The order of the entries in the filter results is based on their occurence in the input list.
   * Note, when used on strings: The String comparison is based on lexicographical ordering.
   * Characters are ranked in their alphabetical order. Words with the same preceding
   * substring are ordered based on their length e.g. "Chris" comes before "Christian".
   */
  // NB = 'NB',
  NE = 'NE', // not equals
  Contains = 'Contains',
  EndsWith = 'EndsWith',
  // NotContains = 'NotContains',    // not contains
  // NotEndsWith = 'NotEndsWith',    // not ends with
  // NotStartsWith = 'NotStartsWith',  // not starts with
  StartsWith = 'StartsWith' // starts with
}

/**
 * 所有过滤条件的接口类型
 */
export interface IFilter extends ISlicer {
  // 过滤条件的类别, 如 name = 'time' for date or week or month or year
  name?: string

  operator?: FilterOperator | any

  /**
   * @deprecated 替换成 {FilteringLogic} 类型的字段
   */
  and?: boolean
}

export enum FilteringLogic {
  And,
  Or
}

export interface IAdvancedFilter extends IFilter {
  filteringLogic: FilteringLogic
  children: Array<IFilter | IAdvancedFilter>
}

export enum AdvancedSlicerOperator {
  Equal = 'Equal',
  NotEqual = 'NotEqual',
  LessThan = 'LessThan',
  GreaterThan = 'GreaterThan',
  LessEqual = 'LessEqual',
  GreaterEqual = 'GreaterEqual',
  Between = 'Between',
  NotBetween = 'NotBetween',
  TopCount = 'TopCount',
  BottomCount = 'BottomCount',
  TopPercent = 'TopPercent',
  BottomPercent = 'BottomPercent',
  TopSum = 'TopSum',
  BottomSum = 'BottomSum'
}

export interface AdvancedSlicer extends IFilter {
  context?: Array<Dimension>
  operator: AdvancedSlicerOperator
  measure: PropertyName
  value: PrimitiveType | PrimitiveType[]
  other?: boolean
}

export type EntityKey<T> =
  | {
      readonly [P in keyof T]?: T[P]
    }
  | string
  | number

/**
 * Query params of entity
 */
export interface QueryOptions<T = any> {
  cube?: string
  parameters?: EntityKey<T>
  rows?: Array<Dimension | Measure>
  columns?: Array<Dimension | Measure>
  /**
   * @deprecated use rows and columns
   */
  selects?: Array<Dimension>
  orderbys?: Array<OrderBy>

  filterString?: string
  filters?: Array<ISlicer>

  search?: string
  params?: Array<string>

  // 分页 TODO
  paging?: {
    top?: number
    skip?: number
    cursor?: string
    before?: string
    after?: string
    last?: number
  }
  /**
   * Provisional calculated measures (includes indicators) definition
   */
  calculatedMeasures?: CalculatedProperty[]
  // Raw SQL or MDX query statement
  statement?: string
  // force refresh
  force?: boolean | void
}

// type Guards
export const isBaseProperty = (toBe): toBe is BaseProperty =>
  !isNil((toBe as BaseProperty)?.dimension)
export const isDimension = (toBe): toBe is Dimension =>
  !isNil((toBe as Dimension)?.dimension) && toBe.dimension !== C_MEASURES
export const isMeasure = (toBe): toBe is Measure => toBe?.dimension === C_MEASURES
export const isMeasureName = (toBe): toBe is string => toBe.startsWith(`[${C_MEASURES}].`)
export const isUnbookedData = (toBe: Dimension | Measure | string): boolean => {
  if (isDimension(toBe)) {
    return !!toBe.unbookedData
  }
  return false
}
export const isSlicer = (toBe): toBe is ISlicer =>
  !isNil((toBe as ISlicer)?.dimension) && !isNil((toBe as ISlicer)?.members)
export const isFilter = (toBe): toBe is IFilter =>
  (!isNil((toBe as IFilter)?.dimension) || !isNil((toBe as IFilter)?.dimension)) && !isNil((toBe as IFilter)?.operator)
export const isAdvancedFilter = (toBe): toBe is IAdvancedFilter => !isNil((toBe as IAdvancedFilter)?.filteringLogic)
export const isAdvancedSlicer = (toBe): toBe is AdvancedSlicer =>
  !isNil(AdvancedSlicerOperator[(toBe as AdvancedSlicer)?.operator])
export const isVariableSlicer = (toBe): toBe is ISlicer =>
  isSlicer(toBe) && !!toBe.dimension.parameter
// Helpers
export function getPropertyName(path: Dimension | Measure | string) {
  return isString(path) ? (isMeasureName(path) ? getMeasureName(path) : path) : (isDimension(path) ? path?.dimension : path?.measure)
}

export function getPropertyHierarchy(path: Dimension | string) {
  return isString(path) ? path : isDimension(path) ? path?.hierarchy || path?.dimension : null
}

export function getPropertyMeasure(path: Measure | PropertyName) {
  return isString(path) ? path : path?.measure
}

export function getMeasureName(path: Measure | PropertyName) {
  if (isString(path)) {
    if (isMeasureName(path)) {
      return path.replace(/^\[Measures\]\.\[/g, '').replace(/\]$/g, '')
    }
    return path
  }
  return path?.measure
}

/**
 * @deprecated use shortUUID
 * 
 * @returns 
 */
export function uuid(): UUID {
  return uuidv4()
}

export function displayByBehaviour(option: IMember, behaviour?: DisplayBehaviour): string {
  switch (behaviour) {
    case DisplayBehaviour.descriptionAndId:
      return `${option.caption || option.label || ''} (#${option.key || option.value})`
    case DisplayBehaviour.descriptionOnly:
      return `${option.caption || option.label || ''}`
    case DisplayBehaviour.idAndDescription:
      return `#${option.key || option.value} (${option.caption || option.label || ''})`
    case DisplayBehaviour.idOnly:
      return `${option.key || option.value}`
    default:
      return `${option.caption || option.label || option.key || option.value}`
  }
}

export function measureFormatter(measure: string) {
  return `[${C_MEASURES}].[${measure}]`
}

export function formatting(value: number | string, formatting: Measure['formatting'], locale?: string) {
  let num = ''
  try {
    value = strToNumber(value)
  } catch(err) {
    return 'NaN'
  }
  
  if (formatting?.unit === '%') {
    value = value * 100
  }

  if (formatting?.shortNumber) {
    const [n, unit] = formatShortNumber(value, locale, formatting?.decimal)
    num = formatNumber(n, locale, formatting?.digitsInfo) + unit
  } else {
    num = formatNumber(value, locale, formatting?.digitsInfo)
  }

  if (formatting?.unit === '%') {
    num = num + '%'
  }
  return num
}

export type JSONValue =
  | null
  | string
  | number
  | boolean
  | {
      [x: string]: JSONValue
    }
  | Array<JSONValue>