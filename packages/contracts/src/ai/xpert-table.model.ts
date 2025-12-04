import { letterStartSUID } from '../types'
import { IWorkflowNode, WorkflowNodeTypeEnum } from './xpert-workflow.model'
import { IBasePerWorkspaceEntityModel } from './xpert-workspace.model'

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
export interface IXpertTable extends IBasePerWorkspaceEntityModel, TXpertTable {}

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
}

export type TXpertTableColumn = {
  name: string
  type: 'string' | 'number' | 'boolean' | 'date' | 'datetime' | 'json' | 
        'text' | 'bigint' | 'decimal' | 'float' | 'timestamp' | 'time' | 'uuid'  // 扩展的数据库类型
  label?: string
  required?: boolean  // NOT NULL 约束
  isPrimaryKey?: boolean  // 主键
  isUnique?: boolean  // 唯一约束
  autoIncrement?: boolean  // 自增
  defaultValue?: string  // 默认值
  length?: number  // 字段长度（主要用于string类型）
  precision?: number  // 精度（用于decimal类型）
  scale?: number  // 小数位数（用于decimal类型）
}


// ===============================
// 📦 Database Operation Nodes
// ===============================

export interface IWorkflowNodeDBOperation extends IWorkflowNode {
  tableId: string
}

export interface IWFNDBInsert extends IWorkflowNodeDBOperation {
  type: WorkflowNodeTypeEnum.DB_INSERT,
  columns?: Record<string, {
    type: 'string' | 'number' | 'boolean' | 'date' | 'datetime' | 'json' | 
          'text' | 'bigint' | 'decimal' | 'float' | 'timestamp' | 'time' | 'uuid';
    value?: any
    valueSelector?: string
  }>
}

export function genXpertDBInsertKey() {
  return letterStartSUID('DBInsert_')
}

export interface IWFNDBUpdate extends IWorkflowNodeDBOperation {
  type: WorkflowNodeTypeEnum.DB_UPDATE
  columns?: Record<string, {
    type: 'string' | 'number' | 'boolean' | 'date' | 'datetime' | 'json' | 
          'text' | 'bigint' | 'decimal' | 'float' | 'timestamp' | 'time' | 'uuid';
    value?: any
    valueSelector?: string
  }>
}

export function genXpertDBUpdateKey() {
  return letterStartSUID('DBUpdate_')
}

export interface IWFNDBDelete extends IWorkflowNodeDBOperation {
  type: WorkflowNodeTypeEnum.DB_DELETE,
}

export function genXpertDBDeleteKey() {
  return letterStartSUID('DBDelete_')
}

export interface IWFNDBQuery extends IWorkflowNodeDBOperation {
  type: WorkflowNodeTypeEnum.DB_QUERY,
}

export function genXpertDBQueryKey() {
  return letterStartSUID('DBQuery_')
}

export interface IWFNDBSql extends IWorkflowNodeDBOperation {
  type: WorkflowNodeTypeEnum.DB_SQL
  sqlTemplate?: string
}

export function genXpertDBSqlKey() {
  return letterStartSUID('DBSql_')
}