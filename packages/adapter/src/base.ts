import * as _axios from 'axios'
import { AdapterBaseOptions, DBProtocolEnum, DBQueryRunner, DBQueryRunnerType, DBSyntaxEnum, IDSSchema, IDSTable, QueryOptions, QueryResult } from './types'

const axios = _axios.default

export const QUERY_RUNNERS: Record<
  string,
  DBQueryRunnerType
> = {}

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

  get configurationSchema() {
    return {}
  }

  get() {
    return axios.get(this.url)
  }

  post(data, options?: any) {
    return axios.post(this.url, data, options)
  }

  abstract runQuery(query: string, options: any): Promise<any>
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
  syntax = DBSyntaxEnum.SQL
  protocol = DBProtocolEnum.SQL

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

/**
 * Register adapter class by `type`
 * 
 * @param type 
 * @param query_runner_class 
 */
export function register<T extends AdapterBaseOptions = AdapterBaseOptions>(
  type: string,
  query_runner_class: new (options?: T, ...args: unknown[]) => DBQueryRunner
) {
  if (QUERY_RUNNERS[type]) {
    throw new Error(`DB adapter type ${type} already existed!`)
  }
  QUERY_RUNNERS[type] = query_runner_class as DBQueryRunnerType
}

/**
 * Find adapter class by `type`, then create it using `options`.
 * 
 * @param type 
 * @param options 
 * @returns 
 */
export function createQueryRunnerByType(type: string, options: AdapterBaseOptions) {
  if (QUERY_RUNNERS[type]) {
    return new QUERY_RUNNERS[type](options)
  }

  return null
}
