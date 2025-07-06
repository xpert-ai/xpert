import { EmbeddingStatusEnum } from '../ai'
import { ITag } from '../tag-entity.model'
import { Visibility } from '../visibility.model'
import { IBusinessArea } from './business-area'
import { ICertification } from './certification.model'
import { IComment } from './comment.model'
import { IPermissionApproval } from './permission-approval.model'
import { IBasePerProjectEntityModel } from './project.model'
import { ISemanticModel } from './semantic-model'

export interface IIndicator extends IBasePerProjectEntityModel {
  // 业务编码
  code?: string
  // 名称
  name?: string

  /**
   * 指标类型
   */
  type?: IndicatorType
  /**
   * Is active: 激活 / 停用
   */
  isActive?: boolean
  /**
   * 是否可见
   */
  visible?: boolean

  /**
   * Available in indicator market app
   */
  isApplication?: boolean
  /**
   * Visibilty in public or secret or private
   */
  visibility?: Visibility

  modelId?: string
  model?: ISemanticModel
  entity?: string
  unit?: string
  principal?: string
  /**
   * @deprecated use certificationId
   */
  authentication?: string
  /**
   * 认证
   */
  certification?: ICertification
  certificationId?: string
  validity?: string
  business?: string
  status?: IndicatorStatusEnum
  embeddingStatus?: EmbeddingStatusEnum
  error?: string

  options?: {
    dimensions?: Array<string>
    filters?: Array<any>
    formula?: string
    measure?: string
    aggregator?: string
    calendar?: string
  }

  businessAreaId?: string
  businessArea?: IBusinessArea

  permissionApprovals?: IPermissionApproval[]
  tags?: ITag[]
  comments?: IComment[]
}

export const IndicatorOptionFields = ['dimensions', 'filters', 'formula', 'measure', 'aggregator', 'calendar']

/**
 * 指标类型:
 * * 基础指标
 * * 衍生指标
 */
export enum IndicatorType {
  BASIC = 'BASIC',
  DERIVE = 'DERIVE'
}

export enum IndicatorStatusEnum {
  /**
   * 草稿
   */
  DRAFT = 'DRAFT',

  /**
   * 已发布
   */
  RELEASED = 'RELEASED',
  /**
   * 下线存档
   */
  ARCHIVED = 'ARCHIVED'
}
