import { Cube, DataSourceOptions, DataSourceSettings, Dimension, Measure, Property } from '@metad/ocap-core'

// Built-in measure field - row count
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
 * Three-part database naming: catalog.schema.table
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
   * Should be equivalent to label
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

export function CubeFactTable(cube: Cube) {
  const tableName = cube.fact?.table?.name
  if (!tableName) {
    throw new Error(`未找到多维数据集 '${cube.name}' 的事实表`)
  }
  // if (!cube.tables?.[0]?.name) {
  //   throw new Error(`未找到多维数据集 '${cube.name}' 的事实表`)
  // }
  /**
   * @todo 支持 SQL View 作为事实表
   */
  return tableName
}