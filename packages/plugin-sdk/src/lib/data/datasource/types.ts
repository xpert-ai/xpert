import * as _axios from 'axios'
import { Readable } from 'stream'
import { IColumnDef, IDSSchema, IDSTable } from '@metad/contracts'
export { IColumnDef, IDSSchema, IDSTable } from '@metad/contracts'
const axios = _axios.default

/**
 * The base options for DB adapters
 */
export interface AdapterBaseOptions {
  /**
   * Ref to debug in `createConnection` of `mysql`
   */
  debug?: boolean
  /**
   * Ref to trace in `createConnection` of `mysql`
   */
  trace?: boolean
  host: string
  port: number
  username: string
  password: string
}

export enum DBSyntaxEnum {
  SQL = 'sql',
  MDX = 'mdx'
}

export enum DBProtocolEnum {
  SQL = 'sql',
  XMLA = 'xmla'
}

/**
 * Options of single query
 */
export interface QueryOptions {
  catalog?: string
  headers?: Record<string, string>
}

export interface QueryResult<T = unknown> {
  status: 'OK' | 'ERROR'
  data?: Array<T>
  columns?: Array<IColumnDef>
  stats?: any
  error?: string
}

/**
 * Duties:
 * - Convert error messages into a unified format
 * - Connect different types of data sources
 */
export interface DBQueryRunner {
  type: string
  name: string
  syntax: DBSyntaxEnum
  protocol: DBProtocolEnum
  host: string
  port: number | string
  jdbcDriver: string
  configurationSchema: Record<string, unknown>

  jdbcUrl(schema?: string): string
  /**
   * Execute a sql query
   *
   * @param sql
   */
  run(sql: string): Promise<any>
  /**
   * Execute a sql query with options
   *
   * @param query
   * @param options
   */
  runQuery(query: string, options?: QueryOptions): Promise<QueryResult | any>
  /**
   * Get catalog (schema or database) list in data source
   */
  getCatalogs(): Promise<IDSSchema[]>
  /**
   * Get schema of table in catalog (schema or database)
   *
   * @param catalog
   * @param tableName
   */
  getSchema(catalog?: string, tableName?: string): Promise<IDSSchema[]>
  /**
   * Describe a sql query result schema
   *
   * @param catalog
   * @param statement
   */
  describe(catalog: string, statement: string): Promise<{ columns?: IDSTable['columns'] }>
  /**
   * Ping the db
   */
  ping(): Promise<void>
  /**
   * Create a new catalog (schema) in database
   *
   * @param catalog
   */
  createCatalog?(catalog: string): Promise<void>
  /**
   * Create or append table data
   *
   * @param params
   * @param options
   */
  import(params: CreationTable, options?: QueryOptions): Promise<any>
  /**
   * Drop a table
   *
   * @param name Table name
   * @param options
   */
  dropTable(name: string, options?: QueryOptions): Promise<void>

  /**
   * Teardown all resources:
   * - close connection
   *
   */
  teardown(): Promise<void>
}

export type DBQueryRunnerType = new (options?: AdapterBaseOptions, ...args: unknown[]) => DBQueryRunner

export interface ColumnDef {
  /**
   * Key of data object
   */
  name: string
  /**
   * Name of table column
   */
  fieldName: string
  /**
   * Object value type, convert to db type
   */
  type: string
  /**
   * Is primary key column
   */
  isKey: boolean
  /**
   * length of type for column: varchar, decimal ...
   */
  length?: number
  /**
   * fraction of type for decimal
   */
  fraction?: number
}

// /**
//  * 与 Server 中类型保持一致
//  */
// export interface IDSSchema {
//   catalog?: string
//   schema?: string
//   name: string
//   label?: string
//   type?: string
//   tables?: Array<IDSTable>
// }

// /**
//  * 与 Server 中类型保持一致
//  */
// export interface IDSTable {
//   schema?: string
//   name?: string
//   label?: string
//   columns?: Array<IColumnDef>
// }

// /**
//  * 与 Server 中类型保持一致
//  */
// export interface IColumnDef {
//   name: string
//   label?: string
//   /**
//    * Types in javascript
//    */
//   type: 'number' | 'string' | 'boolean' | 'object' | 'timestamp'
//   /**
//    * Original data type in database
//    */
//   dataType: string
//   dataLength?: number
//   nullable?: boolean
//   position?: number
//   /**
//    * 应该等同于 label
//    */
//   comment?: string
// }

export interface CreationTable {
  catalog?: string
  table?: string
  name: string
  columns: ColumnDef[]
  data?: any[]
  file?: File
  mergeType?: 'APPEND' | 'DELETE' | 'MERGE'
  format?: 'csv' | 'json' | 'parquet' | 'orc' | 'data'
  columnSeparator?: string
  withHeader?: number
}

export abstract class BaseQueryRunner<T extends AdapterBaseOptions = AdapterBaseOptions> implements DBQueryRunner {
  type: string
  name: string
  syntax: DBSyntaxEnum
  protocol: DBProtocolEnum
  jdbcDriver: string
  abstract get host(): string
  abstract get port(): number | string
  options: T

  jdbcUrl(schema?: string) {
    return ''
  }
  get configurationSchema() {
    return null
  }

  constructor(options?: T) {
    this.options = options
  }

  run(sql: string): Promise<any> {
    return this.runQuery(sql)
  }

  abstract runQuery(query: string, options?: QueryOptions): Promise<QueryResult>
  abstract getCatalogs(): Promise<IDSSchema[]>
  abstract getSchema(catalog?: string, tableName?: string): Promise<IDSSchema[]>
  describe(catalog: string, statement: string): Promise<{columns?: IDSTable['columns']}> {
    throw new Error(`Unimplemented`)
  }
  abstract ping(): Promise<void>
  async import({name, columns, data}, options?: {catalog?: string}): Promise<void> {return null}
  async dropTable(name: string, options?: any): Promise<void> {
    this.runQuery(`DROP TABLE ${name}`, options)
  }
  abstract teardown(): Promise<void>
}

export interface HttpAdapterOptions extends AdapterBaseOptions {
  url?: string
}

export abstract class BaseHTTPQueryRunner<T extends HttpAdapterOptions = HttpAdapterOptions> extends BaseQueryRunner<T> {
  get url(): string {
    return this.options?.url as string
  }
  get host() {
    if (this.options?.host) {
      return this.options.host as string
    }
    return new URL(this.options?.url as string).hostname
  }

  get port(): number | string {
    if (this.options?.port) {
      return Number(this.options.port)
    }
    return new URL(this.options?.url as string).port
  }

  override get configurationSchema() {
    return {}
  }

  get() {
    return axios.get(this.url)
  }

  post(data, options?: any) {
    return axios.post(this.url, data, options)
  }

  // abstract override runQuery(query: string, options: any): Promise<any>
}

/**
 * Adapter options for sql db
 */
export interface SQLAdapterOptions extends AdapterBaseOptions {
  url?: string
  /**
   * Database name, used as catalog
   */
  catalog?: string

  use_ssl?: boolean
  ssl_cacert?: string
  version?: number
}


export abstract class BaseSQLQueryRunner<T extends SQLAdapterOptions = SQLAdapterOptions> extends BaseQueryRunner<T> {
  override syntax = DBSyntaxEnum.SQL
  override protocol = DBProtocolEnum.SQL

  get host() {
    if (this.options?.host) {
      return this.options.host as string
    }
    if (this.options?.url) {
      return new URL(this.options?.url as string).hostname
    }
    return null
  }

  get port() {
    if (this.options?.port) {
      return Number(this.options.port)
    }
    if (this.options?.url) {
      return new URL(this.options?.url as string).port
    }
    return null
  }

  abstract createCatalog?(catalog: string): Promise<void>

  async ping(): Promise<void> {
    await this.runQuery(`SELECT 1`)
  }
}

export interface File {
  /** Name of the form field associated with this file. */
  fieldname: string
  /** Name of the file on the uploader's computer. */
  originalname: string
  /**
   * Value of the `Content-Transfer-Encoding` header for this file.
   * @deprecated since July 2015
   * @see RFC 7578, Section 4.7
   */
  encoding: string
  /** Value of the `Content-Type` header for this file. */
  mimetype: string
  /** Size of the file in bytes. */
  size: number
  /**
   * A readable stream of this file. Only available to the `_handleFile`
   * callback for custom `StorageEngine`s.
   */
  stream: Readable
  /** `DiskStorage` only: Directory to which this file has been uploaded. */
  destination: string
  /** `DiskStorage` only: Name of this file within `destination`. */
  filename: string
  /** `DiskStorage` only: Full path to the uploaded file. */
  path: string
  /** `MemoryStorage` only: A Buffer containing the entire file. */
  buffer: Buffer
}