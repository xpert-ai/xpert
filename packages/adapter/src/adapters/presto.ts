import { DBProtocolEnum, DBSyntaxEnum, IDSSchema, QueryResult } from '../types'
import { Client } from 'presto-client'
import { BaseSQLQueryRunner, register, SQLAdapterOptions } from '../base'
import { convertPGSchema, getPGSchemaQuery, pgTypeMap } from '../helpers'

export interface PrestoAdapterOptions extends SQLAdapterOptions {
  catalog?: string
  schema?: string
  useSSL?: boolean
}

export class PrestoQueryRunner extends BaseSQLQueryRunner<PrestoAdapterOptions> {
  name = 'Presto'
  type = 'presto'
  readonly syntax = DBSyntaxEnum.SQL
  readonly protocol = DBProtocolEnum.SQL

  jdbcDriver = 'com.facebook.presto.jdbc.prestodriver'
  jdbcUrl(schema?: string) {
    const url = `jdbc:presto://${this.host}:${this.port}/${this.options.catalog}/${schema}?`
    const properties = []
    if (this.options.username) {
      properties.push(`user=${encodeURIComponent(this.options.username as string)}`)
    }
    if (this.options.password) {
      properties.push(`password=${encodeURIComponent(this.options.password as string)}`)
    }
    if (this.options.useSSL) {
      properties.push('SSL=true')
    }

    return url + properties.join('&')
  }

  get configurationSchema() {
    return {
      type: 'object',
      properties: {
        host: { type: 'string' },
        port: { type: 'number' },
        http_path: { type: 'string', title: 'HTTP Path' },
        /**
         * https://trino.io/docs/current/overview/concepts.html#catalog
         */
        catalog: { type: 'string' },
        /**
         * https://trino.io/docs/current/overview/concepts.html#schema
         */
        schema: { type: 'string' },
        username: { type: 'string', title: 'User' },
        password: { type: 'string', title: 'Password' },
        useSSL: { type: 'boolean', title: 'Use SSL', default: false }
      },
      order: ['host', 'port', 'http_path', 'username', 'password', 'catalog', 'schema'],
      secret: ['password'],
      required: ['host', 'http_path']
    }
  }

  client: Client
  constructor(options: PrestoAdapterOptions) {
    super(options)

    const clientOptions = {
      host: this.options.host,
      port: this.options.port
    } as any
    clientOptions.user = this.options.username || 'hive'
    if (this.options.catalog) {
      clientOptions.catalog = this.options.catalog
    }
    if (this.options.schema) {
      clientOptions.schema = this.options.schema
    }
    if (this.options.username) {
      clientOptions.basic_auth = {
        user: this.options.username,
        password: this.options.password
      }
    }

    this.client = new Client(clientOptions)
  }

  async execute(query: string, options?: Record<string, unknown>): Promise<QueryResult> {
    return new Promise((resolve, reject) => {
      let columns
      let data = []
      this.client.execute({
        query: query,
        catalog: this.options.catalog || 'hive',
        schema: options?.catalog || 'default',
        source: 'nodejs-client',
        state: (error, query_id, stats) => {
          // console.log({message:"status changed", id: query_id, stats: stats})
        },
        columns: (error, data) => {
          columns = data
        },
        data: (error, results, columns, stats) => {
          data = results
        },
        success: (error, stats) => {
          resolve({
            status: "OK",
            data: data.map((item) => {
              const row = {}
              columns?.forEach((col, index) => {
                row[col.name] = item[index]
              })
              return row
            }),
            columns: columns.map((item) => ({
              ...item,
              type: pgTypeMap(item.type)
            })),
            stats
          })
        },
        error: (error) => {
          reject(error)
        }
      })
    })
  }

  async runQuery(query: string, options?: any) {
    return this.execute(query, options)
  }

  async getCatalogs(): Promise<IDSSchema[]> {
    return this.execute(`show schemas`).then(({ data }) => {
      return data
        ?.filter((item: any) => item.Schema !== 'pg_catalog' && item.Schema !== 'information_schema')
        .map((item: any) => ({
          name: item.Schema
        }))
    })
  }

  async getSchema(schemaName?: string, tableName?: string): Promise<IDSSchema[]> {
    return this.execute(getPGSchemaQuery(schemaName, tableName)).then(({ data }) => {
      return convertPGSchema(data)
    })
  }

  async describe(catalog: string, statement: string) {
    if (!statement) {
      return { columns: [] }
    }

    // Remove trailing semicolon, if present, and trim whitespace
    statement = statement.trim().replace(/;+$/, '')
    statement = `${statement} LIMIT 1`
    return this.runQuery(statement, { catalog })
  }

  /**
   * @todo Implement
   * @param catalog 
   * @param options 
   */
  override async createCatalog(catalog: string, options?: Record<string, any>) {
    throw new Error('Method not implemented.')
  }

  async teardown() {
    return null
  }
}

register('presto', PrestoQueryRunner)
