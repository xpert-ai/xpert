import { EmbeddingStatusEnum } from '../ai'
import { ChecklistItem } from '../types'
import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { ISemanticModel } from './semantic-model'

/**
 * Common fields of Indicator (draft and entity)
 */
export type TIndicator = {
  // Indicator business code
  code?: string
  // Name of the indicator
  name?: string
  /**
   * Indicator Type
   */
  type?: IndicatorType
  /**
   * Visible in model
   */
  visible?: boolean

  modelId?: string

  entity?: string
  unit?: string
  principal?: string
  validity?: string
  business?: string

  options?: {
    dimensions?: Array<string>
    filters?: Array<any>
    formula?: string
    measure?: string
    aggregator?: string
    calendar?: string
  }
}

/**
 * Fields included in the draft of Indicator, please keep it in sync with TIndicator type
 */
export const IndicatorDraftFields: Array<keyof IIndicator> = [
  'code',
  'name',
  'type',
  'visible',
  'modelId',
  'entity',
  'unit',
  'principal',
  'validity',
  'business',
  'options'
]

export type TIndicatorDraft = TIndicator & {
  checklist?: ChecklistItem[]
  version?: number
  savedAt?: Date
}

export interface IIndicator extends IBasePerTenantAndOrganizationEntityModel, TIndicator {
  draft?: TIndicatorDraft

  model?: ISemanticModel
  status?: IndicatorStatusEnum
  embeddingStatus?: EmbeddingStatusEnum
  error?: string
  publishedAt?: Date
}

export const IndicatorOptionFields = ['dimensions', 'filters', 'formula', 'measure', 'aggregator', 'calendar']

/**
 * Indicator Type:
 * * Basic indicators
 * * Derivative Indicators
 */
export enum IndicatorType {
  BASIC = 'BASIC',
  DERIVE = 'DERIVE'
}

/**
 * Status of the indicator
 */
export enum IndicatorStatusEnum {
  /**
   * draft
   */
  DRAFT = 'DRAFT',

  /**
   * Published
   */
  RELEASED = 'RELEASED',
  /**
   * Offline Archive
   */
  ARCHIVED = 'ARCHIVED'
}
