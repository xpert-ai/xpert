import {
  AnalyticsAnnotation,
  IdentificationAnnotation,
  PresentationVariant,
  SelectionFieldsAnnotation,
  SelectionPresentationVariant,
  SelectionVariant,
  ValueListAnnotation
} from './annotations'
import { ChartAnnotation } from './annotations/chart'
import { KPIType } from './annotations/kpi'
import { CalculatedMember } from './models'
import { Dimension } from './types'
import { isNil } from './utils'

export interface DataSettings {
  /**
   * The semantic model id
   */
  modelId?: string
  /**
   * The name of dataSource: key of semantic model
   */
  dataSource: string
  /**
   * The cube name in dataSource
   */
  entitySet: string
  
  dimension?: Dimension
  chartAnnotation?: ChartAnnotation
  selectionVariant?: SelectionVariant
  presentationVariant?: PresentationVariant
  selectionPresentationVariant?: Array<SelectionPresentationVariant>

  analytics?: AnalyticsAnnotation
  /**
   * @deprecated unused
   */
  selectionFieldsAnnotation?: SelectionFieldsAnnotation
  /**
   * @deprecated unused
   */
  valueListAnnotation?: ValueListAnnotation
  KPIAnnotation?: KPIType
  /**
   * @deprecated unused
   */
  identificationAnnotation?: IdentificationAnnotation

  /**
   * @deprecated unused
   */
  lazyInit?: boolean

  /**
   * @experimental
   * Runtime calculated members to be used in the data settings
   */
  calculatedMembers?: CalculatedMember[]

  /**
   * @experimental Key-value pairs of parameters for query
   */
  parameters?: Record<string, any>
}

// type Guards
export const isDataSettings = (toBe): toBe is DataSettings =>
  !isNil(toBe?.dataSource) && !isNil(toBe?.entitySet)
