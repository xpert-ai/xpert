import {
  AdvancedSlicer,
  CalculatedMember,
  Cube,
  C_MEASURES,
  getMemberValue,
  NamedSet,
  PropertyName
} from '@metad/ocap-core'
import { startsWith } from 'lodash'
import { WithMemberType } from '../calculation'
import { MDXHierarchyFilter, MDXProperty } from '../filter'

export enum MDXRank {
  Top = 'Top',
  Bottom = 'Bottom'
}

export interface MDXQuery {
  entity?: string
  cube?: Cube
  members?: Array<CalculatedMember | NamedSet>
  /**
   * @deprecated 使用 rows
   */
  dimensions?: Array<MDXProperty>
  /**
   * @deprecated 使用 columns
   */
  measures?: Array<PropertyName>
  rows?: Array<MDXProperty>
  columns?: Array<MDXProperty>
  slicers?: Array<MDXHierarchyFilter>
  variables?: Array<MDXHierarchyFilter>
  orderbys?: Array<MDXProperty>
  rank?: [MDXRank, number]
  conditions?: Array<AdvancedSlicer>
  advancedFilters?: Array<string>
  withMembers: Record<string, WithMemberType>
  parameters?: Record<string, any>
}

export interface EngineAxis {
  statement: string
  members?: Array<CalculatedMember | NamedSet>
  zeroSuppression?: boolean
}

export function isWrapBrackets(name: string) {
  return name?.match(/\[.*\]/g)
}

export function wrapBrackets(name: string) {
  if (name && !isWrapBrackets(name)) {
    return `[${name}]`
  }
  return name
}

export function unwrapBrackets(name: string) {
  const m = name?.match(/\[(.*)\]/)
  if (m) {
    return m[1]
  }
  return name
}

/**
 * 将 Hierarchy 和其 Member 的值拼接成 MDX 语句中的 Member 唯一标识形式
 */
export function wrapHierarchyValue(hierarchy: string, value: string) {
  // 有的 Member 值里包含 Hierarchy 名字如 `"[Time.Weekly].[1998].[01]"`
  if (startsWith(value, hierarchy)) {
    return value
  }
  return `${hierarchy}.${wrapBrackets(value)}`
}

export function escapeBWSlash(dimension: string, name: string) {
  return dimension + name.replace(dimension, '').replace(/\//g, '_')
}

export function getQueryDefaultMeasure(query: MDXQuery) {
  const measures =
    query.columns?.find((item) => item.dimension === C_MEASURES) ||
    query.rows?.find((item) => item.dimension === C_MEASURES)
  return getMemberValue(measures?.members?.[0])
}

export function serializeUniqueName(dialect: string, dimension: string, hierarchy?: string, level?: string, intrinsic?: string) {
  const separator = '.'
  const connector = '.'
  let name = !!hierarchy && dimension !== hierarchy ? `[${dimension}${separator}${hierarchy}]` : `[${dimension}]`

  if (intrinsic) {
    name = `${name}${connector}[${level}]${connector}[${intrinsic}]`
  } else if (level) {
    name = `${name}${connector}[${level}]`
  }

  return name
}

export function serializeMeasureName(dialect: string, measure: string) {
  if (isCaseInsensitive(dialect)) {
    measure = measure.toLowerCase()
  }

  return measure
}

export function isCaseInsensitive(dialect: string) {
  return ['hive'].includes(dialect)
}
