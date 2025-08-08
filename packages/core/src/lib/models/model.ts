import { AgentType } from '../agent'
import { Syntax } from '../types'
import { Schema } from './sdl'

export type TableColumnType = 'String' | 'Integer' | 'Numeric' | 'Boolean' | 'Datetime' | 'Date' | 'Time'

export interface TableEntity {
  name: string
  type: 'parquet' | 'csv' | 'json' | 'excel'
  sourceUrl: string
  delimiter?: string
  header?: boolean
  sheets?: any
  batchSize?: number
  columns?: Array<{name: string, type: TableColumnType}>
}

/**
 * @deprecated Relationship to `DataSourceOptions` ? DataSourceOptions inherited from me
 */
export interface SemanticModel {
  /**
   * System id in server
   */
  id?: string
  /**
   * @deprecated use key
   */
  name?: string
  /**
   * Semantic key
   */
  key?: string
  caption?: string
  type: 'SQL' | 'XMLA' | 'OData'
  agentType?: AgentType
  /**
   * The language used for data query
   */
  syntax?: Syntax
  /**
   * Dialects in data sources, such as SAP, Microsoft, etc. in OData, SAP BW in XMLA, Postgres, Mysql, Hive, etc. in SQL databases
   */
  dialect?: string
  /**
   * DB Schema / OData Catalog ...
   */
  catalog?: string

  /**
   * Table defination for wasm database
   */
  tables?: Array<TableEntity>
  /**
   * Initialization Script for wasm database
   */
  dbInitialization?: string

  /**
   * Schema of semantic model cubes
   */
  schema?: Schema
}
