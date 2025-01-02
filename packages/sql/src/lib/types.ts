import { DataSourceOptions, DataSourceSettings, Dimension, Measure, Property } from '@metad/ocap-core'

// 固有度量字段 行计数
export const C_MEASURES_ROW_COUNT = 'Measures_Row_Count'

export interface SQLDataSourceOptions extends DataSourceOptions {
  settings?: SQLDataSourceSettings
}
export interface SQLDataSourceSettings extends DataSourceSettings {
  id?: string
  database?: string
}

/**
 * Database original schema
 *
 * 三段式数据库命名 catalog.schema.table
 */
export interface SQLSchema {
  catalog?: string
  schema?: string
  tables?: SQLTableSchema[]
}

export interface SQLTableSchema {
  name: string
  label?: string
  columns: IColumnDef[]
}

export interface SQLQueryContext {
  rows: Array<SQLQueryProperty>
  columns: Array<SQLQueryProperty>
  select?: string[]
  where?: string[]
  groupbys?: string[]
  unbookedData?: string[]
  zeroSuppression?: boolean
  dialect?: string
}

export interface SQLQueryProperty {
  dimension: Dimension | Measure
  property: Property
}

// Types for sql database exec
/**
 * Sync with @metad/contacts
 */
export interface IColumnDef {
  name: string
  label?: string
  /**
   * Types in javascript
   */
  type: 'number' | 'string' | 'boolean'
  /**
   * Original data type in database
   */
  dataType: string
  dataLength?: number
  nullable?: boolean
  position?: number
  /**
   * 应该等同于 label
   */
  comment?: string
}

export interface SQLQueryResult {
  status: 'OK' | 'ERROR'
  data?: Array<unknown>
  columns?: Array<IColumnDef>
  stats?: any
  error?: string
}

export enum AggregateFunctions {
  COUNT,
  COUNT_DISTINCT
}

export const C_ALL_MEMBER_NAME = `(All)`
export const C_ALL_MEMBER_CAPTION = `All`

export const SQLErrorCode = {
  CUBE_DEFAULT_MEASURE: 'Cube default measure is required!'
}

export class SQLError extends Error {
  constructor(code: keyof typeof SQLErrorCode) {
    super(SQLErrorCode[code])
  }
}
