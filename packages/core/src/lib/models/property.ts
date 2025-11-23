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

export interface PropertySemantics {
  semantic?: Semantics
  formatter?: string
  hidden?: boolean
}

export interface EntityProperty extends BaseProperty, PropertyAttributes {
  /**
   * The Entity it belongs to
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
  /**
   * Semantics information of this property
   */
  semantics?: PropertySemantics

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
