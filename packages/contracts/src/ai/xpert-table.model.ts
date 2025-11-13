import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { IXpert } from './xpert.model'

/**
 * 表状态：符合我们前面讨论的多状态流程
 */
export enum XpertTableStatus {
  DRAFT = 'draft',
  READY = 'ready',
  PENDING_ACTIVATION = 'pendingActivation',
  ACTIVE = 'active',
  NEEDS_MIGRATION = 'needsMigration',
  DEPRECATED = 'deprecated',
  ERROR = 'error'
}

/**
 * Custom Table for Xpert
 */
export interface IXpertTable extends IBasePerTenantAndOrganizationEntityModel, TXpertTable {}

export type TXpertTable = {
  name: string // 逻辑表名（用户侧看到的名称，如 "customer_orders"）
  description?: string
  database?: string
  schema?: string
  columns?: TXpertTableColumn[]
  status: XpertTableStatus
  version?: number
  activatedAt?: Date
  message?: string
  xpert?: IXpert
  xpertId: string
}

export type TXpertTableColumn = {
  name: string
  type: 'string' | 'number' | 'boolean' | 'date' | 'datetime' | 'json'
  label?: string
  required?: boolean
}
