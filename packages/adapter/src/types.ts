import { Readable } from 'stream'
import { DBTableAction, DBTableOperationParams } from '@xpert-ai/plugin-sdk'

export { DBTableAction, DBTableOperationParams } from '@xpert-ai/plugin-sdk'

export interface AdapterError {
  message: string
  code: string
  stats: {
    statements: string[]
  }
}

/**
 * @deprecated use plugin-sdk
 */
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

/**
 * @deprecated use plugin-sdk
 */
export interface IDSSchema {
  catalog?: string
  schema?: string
  name: string
  label?: string
  type?: string
  tables?: Array<IDSTable>
}

/**
 * @deprecated use plugin-sdk
 */
export interface IDSTable {
  schema?: string
  name?: string
  label?: string
  columns?: Array<IColumnDef>
}

/**
 * @deprecated use plugin-sdk
 */
export interface IColumnDef {
  name: string
  label?: string
  /**
   * Types in javascript
   */
  type: 'number' | 'string' | 'boolean' | 'object' | 'timestamp'
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

/**
 * @deprecated use plugin-sdk
 */
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

/**
 * @deprecated use plugin-sdk
 */
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

/**
 * @deprecated use plugin-sdk
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

/**
 * @deprecated use plugin-sdk
 */
export interface QueryOptions {
  catalog?: string
  headers?: Record<string, string>
}

/**
 * @deprecated use plugin-sdk
 */
export enum DBSyntaxEnum {
  SQL = 'sql',
  MDX = 'mdx'
}

/**
 * @deprecated use plugin-sdk
 */
export enum DBProtocolEnum {
  SQL = 'sql',
  XMLA = 'xmla'
}

export interface QueryResult<T = unknown> {
  status: 'OK' | 'ERROR'
  data?: Array<T>
  columns?: Array<IColumnDef>
  stats?: any
  error?: string
}

export { }
