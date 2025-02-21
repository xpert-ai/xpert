import { format, isDate } from 'date-fns'
import {
  AdvancedSlicer,
  Dimension,
  Drill,
  FilteringLogic,
  FilterOperator,
  getPropertyHierarchy,
  IAdvancedFilter,
  IFilter,
  IMember,
  isAdvancedFilter,
  isAdvancedSlicer,
  isFilter,
  ISlicer,
  Measure
} from './types'
import { compact, isArray, isString } from './utils'

// format
export const HTML5_FMT_DATETIME_LOCAL_SECONDS = `yyyy-MM-dd'T'HH:mm:ss`
export const HTML5_FMT_DATE = 'yyyy-MM-dd'

/**
 * 对 IFilter 过滤条件接口的便捷实现类
 */
export class Filter implements IFilter {
  name?: string
  drill?: Drill
  distance?: number

  exclude?: boolean

  constructor(
    public dimension: Dimension | Measure,
    public members: Array<IMember>,
    public operator: FilterOperator = FilterOperator.EQ,
    public and = true
  ) {}

  setName(value) {
    this.name = value
    return this
  }

  setAnd(value) {
    this.and = value
    return this
  }

  And() {
    this.and = true
    return this
  }

  Or() {
    this.and = false
    return this
  }
}

/**
 * 静默 filterContainer 发出的 filterAction 都为静默 filter
 */
export interface FilterAction {
  action: 'remove' | 'put' | 'refresh'
  // 是否为静默 filter 事件
  silent?: boolean
  params: any
}

export enum FilterMergeMode {
  ignore,
  replace,
  merge
}

/**
 * put Filter in array
 */
export function putFilter(filters: Array<ISlicer>, value: ISlicer | ISlicer[], mode?: FilterMergeMode): Array<ISlicer> {
  if (isArray(value)) {
    value.forEach((item) => {
      filters = putFilter(filters, item, mode)
    })
    return filters
  }

  let existed = false
  const ftrs = (filters || []).map((item) => {
    if (existed) {
      return item
    }

    if (item.dimension && 
      item.dimension.parameter ? item.dimension.parameter === value.dimension?.parameter
        : getPropertyHierarchy(item.dimension) === getPropertyHierarchy(value.dimension) ) {
      existed = true
      if (item.dimension.name === value.dimension.name) {
        // path 的 hierarchy 和 name 相同则覆盖
        return value
      }

      if (mode === FilterMergeMode.ignore) {
        return item
      } else if (mode === FilterMergeMode.merge) {
        //TODO
        return value
      }
      return value
    } else if (isAdvancedSlicer(value) && isAdvancedSlicer(item)) {
      existed = true
      return value
    }
    return item
  })

  // // 当 value 为 null 时视为移除此 filter
  // if (!isAdvancedFilter(value) && isNil(value.value)) {
  //   return ftrs
  // }
  if (!existed) {
    ftrs.push(value)
  }
  return ftrs
}

/**
 * remove Filter from array
 */
export function removeFilter(filters: Array<ISlicer>, value: ISlicer | string): Array<ISlicer> {
  if (isFilter(value)) {
    return filters.filter((item, i) => item.dimension.dimension !== value.dimension.dimension)
  } else {
    // remove by name or path
    return filters.filter((item) => item.dimension.dimension !== value)
  }
}

/**
 * 将 filter 转成可显示的 tag 字符串
 *
 * @deprecated use slicerAsString
 */
export function filterAsTag(ftr: IFilter): string {
  const value = getValueString(ftr.members)
  switch (ftr.operator) {
    case FilterOperator.BT:
      return `${ftr.members[0]}...${ftr.members[1]}`
    case FilterOperator.EQ:
      return ftr.members.map(({ value, label }) => `${label || getValueString(value)}`).join(', ')
    case FilterOperator.NE:
      return `≠${value}`
    case FilterOperator.LT:
      return `<${value}`
    case FilterOperator.LE:
      return `≤${value}`
    case FilterOperator.GT:
      return `>${value}`
    case FilterOperator.GE:
      return `≥${value}`
    case FilterOperator.Contains:
      return `*${value}*`
    case FilterOperator.EndsWith:
      return `*${value}`
    case FilterOperator.StartsWith:
      return `${value}*`
    default:
      return ''
  }
}

export function slicerAsString(slicer: ISlicer) {
  if (isAdvancedFilter(slicer)) {
    return `[${slicer.children
      .map((item) => slicerAsString(item))
      .join(slicer.filteringLogic === FilteringLogic.And ? ' & ' : ', ')}]`
  }

  if (isFilter(slicer)) {
    const value = getValueString(slicer.members[0]?.key)
    switch (slicer.operator) {
      case FilterOperator.BT:
        return `${slicer.members[0]?.key}...${slicer.members[1]?.key}`
      case FilterOperator.EQ:
        return slicer.members.map((member) => `${member.caption || getValueString(member.key)}`).join(', ')
      case FilterOperator.NE:
        return `≠${value}`
      case FilterOperator.LT:
        return `<${value}`
      case FilterOperator.LE:
        return `≤${value}`
      case FilterOperator.GT:
        return `>${value}`
      case FilterOperator.GE:
        return `≥${value}`
      case FilterOperator.Contains:
        return `*${value}*`
      case FilterOperator.EndsWith:
        return `*${value}`
      case FilterOperator.StartsWith:
        return `${value}*`
      default:
        return ''
    }
  }

  return (
    (slicer.exclude ? '≠' : '') +
    (slicer.members?.map((member) => `${member.caption || getValueString(member.key)}`).join(', ') ?? '')
  )
}

function getValueString(value) {
  if (isDate(value)) {
    return format(value, HTML5_FMT_DATE)
  }
  if (!isString(value)) {
    return `${value}`
  }
  return value ? (value.startsWith('datetime') ? value : `'${value}'`) : ''
}

export function filterAddValue(ftr, value, text) {
  isArray(ftr.value) ? ftr.value.push(value) : (ftr.value = [value])
  isArray(ftr.text) ? ftr.text.push(text) : (ftr.text = [text])
}

export function filterAddFilter(ftr, another) {
  if (isArray(another.value)) {
    another.value.forEach((value, i) => filterAddValue(ftr, value, another.text[i]))
  } else {
    filterAddValue(ftr, another.value, another.text)
  }
}

export const FILTER_OPERATOR_DESC = {
  All: '空',
  // Any: '任意',
  BT: '介于',
  EQ: '等于', //
  GE: '大于等于', //
  GT: '大于', //
  LE: '小于等于', //
  LT: '小于', //
  /**
   * FilterOperator "Not Between"
   * Used to filter all entries, which are not between the given boundaries.
   * The filter result does not contains the boundaries, but only entries outside of the boundaries.
   * The order of the entries in the filter results is based on their occurence in the input list.
   * Note, when used on strings: The String comparison is based on lexicographical ordering.
   * Characters are ranked in their alphabetical order.
   * Words with the same preceding substring are ordered based on their length e.g. "Chris" comes before "Christian".
   */
  // NB = 'NB',
  NE: '不等于', // not equals
  // NotContains = 'NotContains',    // not contains
  // NotEndsWith = 'NotEndsWith',    // not ends with
  // NotStartsWith = 'NotStartsWith',  // not starts with
  Contains: '包含', //
  StartsWith: '开始于', // starts with
  EndsWith: '结束于' //
}

export function advancedSlicerAsString(slicer: AdvancedSlicer, i18nOnContext?: string) {
  return `${slicer.operator}(${isArray(slicer.value) ? compact(slicer.value) : slicer.value},${slicer.measure}) ${
    i18nOnContext ?? 'on context'
  }:(${slicer.context.map(({ dimension }) => dimension)})`
}

export function toAdvancedFilter(slicers: ISlicer[], filteringLogic: FilteringLogic = FilteringLogic.Or): IAdvancedFilter | ISlicer {
  return slicers.length > 1
    ? ({
        filteringLogic,
        children: slicers
      } as IAdvancedFilter)
    : slicers[0]
}
