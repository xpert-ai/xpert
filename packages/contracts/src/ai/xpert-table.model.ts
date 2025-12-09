import { letterStartSUID } from '../types'
import { IWorkflowNode, WorkflowNodeTypeEnum } from './xpert-workflow.model'
import { IBasePerWorkspaceEntityModel } from './xpert-workspace.model'

/**
 * Table status
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
  name: string // Logical table name (the name users see, e.g., "customer_orders")
  description?: string
  database?: string
  schema?: string
  columns?: TXpertTableColumn[]
  status: XpertTableStatus
  version?: number
  activatedAt?: Date
  message?: string
}

// /**
//  * MySQL data types supported by the system
//  * Organized by category for better understanding
//  */
// export type MySQLDataType =
//   // Numeric types - Integers
//   | 'tinyint' | 'smallint' | 'mediumint' | 'int' | 'integer' | 'number' | 'bigint'  // number is alias for int
//   // Numeric types - Floating point
//   | 'float' | 'double' | 'decimal' | 'numeric'
//   // String types - Fixed/Variable length
//   | 'char' | 'varchar' | 'string'  // string is alias for varchar
//   // String types - Text
//   | 'tinytext' | 'text' | 'mediumtext' | 'longtext'
//   // String types - Binary
//   | 'tinyblob' | 'blob' | 'mediumblob' | 'longblob'
//   // String types - Special
//   | 'enum' | 'set'
//   // Date and time types
//   | 'date' | 'time' | 'datetime' | 'timestamp' | 'year'
//   // JSON type
//   | 'json' | 'object'  // object is alias for json
//   // Spatial types
//   | 'geometry' | 'point' | 'linestring' | 'polygon' | 'multipoint' | 'multilinestring' | 'multipolygon' | 'geometrycollection'
//   // Other
//   | 'boolean' | 'bool'  // bool is alias for tinyint(1)

// /**
//  * PostgreSQL data types supported by the system
//  * Organized by category for better understanding
//  */
// export type PostgreSQLDataType =
//   // Numeric types - Integers
//   | 'smallint' | 'int' | 'integer' | 'number' | 'bigint' | 'serial' | 'bigserial'
//   // Numeric types - Floating point
//   | 'real' | 'float' | 'double' | 'decimal' | 'numeric' | 'money'
//   // String types
//   | 'char' | 'character' | 'varchar' | 'string' | 'text' | 'bytea'
//   // Date and time types
//   | 'date' | 'time' | 'timetz' | 'datetime' | 'timestamp' | 'interval'
//   // Boolean type
//   | 'boolean' | 'bool'
//   // Enum type
//   | 'enum'
//   // JSON types
//   | 'json' | 'jsonb' | 'object'
//   // UUID type
//   | 'uuid'
//   // Array types
//   | 'array_int' | 'array_varchar' | 'array_text' | 'array_jsonb'
//   // Geometric types
//   | 'point' | 'line' | 'circle'
//   // XML type
//   | 'xml'
//   // HSTORE type
//   | 'hstore'

/**
 * Union type for all supported database types
 * Used when database type is not yet determined or needs to support multiple databases
 */
export type DatabaseDataType = string // MySQLDataType | PostgreSQLDataType

export type TXpertTableColumn = {
  name: string
  type: DatabaseDataType
  label?: string
  required?: boolean  // NOT NULL constraint
  isPrimaryKey?: boolean  // Primary key
  isUnique?: boolean  // Unique constraint
  autoIncrement?: boolean  // Auto increment
  defaultValue?: string  // Default value
  length?: number  // Field length (for CHAR, VARCHAR, etc.)
  precision?: number  // Precision (for DECIMAL)
  scale?: number  // Scale (for DECIMAL)
  enumValues?: string[]  // Enum values (for ENUM type)
  setValues?: string[]  // Set values (for SET type)
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
    type: DatabaseDataType;
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
    type: DatabaseDataType;
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