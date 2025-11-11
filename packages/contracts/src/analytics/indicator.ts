import { EmbeddingStatusEnum } from '../ai'
import { ITag } from '../tag-entity.model'
import { ChecklistItem } from '../types'
import { Visibility } from '../visibility.model'
import { IBusinessArea } from './business-area'
import { ICertification } from './certification.model'
import { IComment } from './comment.model'
import { IPermissionApproval } from './permission-approval.model'
import { IBasePerProjectEntityModel } from './project.model'
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

  /**
   * Available in indicator market app
   */
  isApplication?: boolean

  modelId?: string
  
  entity?: string
  unit?: string
  principal?: string
  /**
   * @deprecated use certificationId
   */
  authentication?: string
  
  certificationId?: string

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

  businessAreaId?: string
}

export type TIndicatorDraft = TIndicator & {
  checklist?: ChecklistItem[]
  version?: number
  savedAt?: Date
}

export interface IIndicator extends IBasePerProjectEntityModel, TIndicator {
  draft?: TIndicatorDraft
  // /**
  //  * Is active: Activate / Deactivate
  //  * 
  //  * @deprecated use status instead
  //  */
  // isActive?: boolean
  
  /**
   * Visibilty in public or secret or private
   */
  visibility?: Visibility

  model?: ISemanticModel
  /**
   * Quality Certification
   */
  certification?: ICertification
  
  status?: IndicatorStatusEnum
  embeddingStatus?: EmbeddingStatusEnum
  error?: string
  
  businessArea?: IBusinessArea

  permissionApprovals?: IPermissionApproval[]
  tags?: ITag[]
  comments?: IComment[]
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
