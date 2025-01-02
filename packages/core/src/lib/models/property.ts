import { Semantics } from '../annotations'
import { BaseProperty } from '../types'

export enum AggregationRole {
  dimension = 'dimension',
  hierarchy = 'hierarchy',
  level = 'level',
  measure = 'measure',
  text = 'text',
  variable = 'variable'
}

export enum DataType {
  Unknown = 'Unknown',
  Numeric = 'Numeric',
  Integer = 'Integer',
  String = 'String',
  Boolean = 'Boolean',
  Date = 'Date',
  Datetime = 'Datetime',
  Time = 'Time',
  Timestamp = 'Timestamp'
}

export interface PropertyAttributes {
  __id__?: string
  uniqueName?: string
  name: string
  /**
   * The caption of property
   */
  caption?: string
  /**
   * Property role
   */
  role?: AggregationRole
  /**
   * Property is in Runtime only, not in Semantic Model
   */
  rt?: boolean

  /**
   * Visible Property
   */
  visible?: boolean
}

export interface EntityProperty extends BaseProperty, PropertyAttributes {
  /**
   * 所属的 Entity
   */
  entity?: string
  description?: string
  dataType?: DataType | string
  /**
   * @deprecated use semantics
   */
  semantic?: Semantics
  /**
   * @deprecated use semantics
   */
  formatter?: string

  semantics?: {
    semantic?: Semantics
    formatter?: string
  }

  /**
   * @deprecated use memberCaption
   */
  text?: string | EntityProperty
  unit?: string | EntityProperty

  /**
   * The caption field of members in this property
   */
  memberCaption?: string
}
