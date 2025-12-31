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

/**
 * Get the fact table name for a cube
 * 
 * Supports multiple configuration modes:
 *   - Single table mode: cube.fact.table.name
 *   - Multi-table mode: cube.tables[0].name (first table is fact table)
 *   - SQL View mode: cube.fact.view.alias
 * 
 * @param cube Cube configuration
 * @returns Fact table name
 */
export function CubeFactTable(cube: Cube): string {
  // Priority 1: Direct fact table configuration
  if (cube.fact?.table?.name) {
    return cube.fact.table.name
  }
  
  // Priority 2: Multi-table mode - first table is fact table
  if (cube.tables && cube.tables.length > 0 && cube.tables[0].name) {
    return cube.tables[0].name
  }
  
  // Priority 3: SQL View mode
  if (cube.fact?.view?.alias) {
    return cube.fact.view.alias
  }
  
  throw new Error(`未找到多维数据集 '${cube.name}' 的事实表`)
}