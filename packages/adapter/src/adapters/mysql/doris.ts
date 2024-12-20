import { Connection, Pool, createConnection } from 'mysql' // mysql2 package 的连不上 Doris
import * as _axios from 'axios'
import { Readable } from 'stream'
import { BaseSQLQueryRunner, register } from '../../base'
import { convertMySQLSchema, pick, SkipHeaderTransformStream, typeToStarrocksDB } from '../../helpers'
import { CreationTable, File, IDSSchema, QueryOptions } from '../../types'
import { MysqlAdapterOptions } from './mysql'

const axios = _axios.default

export const DORIS_TYPE = 'doris'
export const STARROCKS_TYPE = 'starrocks'

export interface DorisAdapterOptions extends MysqlAdapterOptions {
  apiHost?: string
  apiPort?: number
}

export class DorisRunner extends BaseSQLQueryRunner<DorisAdapterOptions> {
  readonly name: string = 'Doris'
  readonly type: string = DORIS_TYPE

  readonly jdbcDriver = 'com.mysql.jdbc.Driver'
  jdbcUrl(schema?: string) {
    return `jdbc:mysql://${this.options.host}:${this.options.port}/${schema}?user=${encodeURIComponent(
      this.options.username as string
    )}&password=${encodeURIComponent(this.options.password as string)}`
  }

  get configurationSchema() {
    return {
      type: 'object',
      properties: {
        host: { type: 'string' },
        port: { type: 'number', default: 9030 },
        username: { type: 'string', title: 'Username' },
        password: { type: 'string', title: 'Password' },
        apiHost: { type: 'string' },
        apiPort: { type: 'number', default: 8030 },
        version: { type: 'number', default: 0 },
        // 目前 catalog 用于指定数据库，Doris 的 catalog 只支持默认
        catalog: { type: 'string', title: 'Database' },
        // database: { type: 'string' },
        // for SSL
        use_ssl: { type: 'boolean', title: 'Use SSL' },
        ssl_cacert: {
          type: 'textarea',
          title: 'CA certificate',
          depend: 'use_ssl'
        },
        ssl_cert: {
          type: 'textarea',
          title: 'Client certificate',
          depend: 'use_ssl'
        },
        ssl_key: {
          type: 'textarea',
          title: 'Client key',
          depend: 'use_ssl'
        },

        queryTimeout: {
          type: 'number',
          title: 'Query timeout',
        }
      },
      order: ['host', 'port', 'apiHost', 'apiPort', 'username', 'password'],
      required: [],
      secret: ['password']
    }
  }

  #connection = null
  protected createConnection(database?: string) {
    const config: any = pick(this.options, ['host', 'port', 'password', 'database'])
    if (this.options.username) {
      config.user = this.options.username
    }
    if (database) {
      config.database = database
    }

    if (this.options.use_ssl) {
      if (!this.options.ssl_cacert) {
        throw new Error(`No mysql ca cert for ssl connection`)
      }
      config.ssl = {
        ca: this.options.ssl_cacert
      }
    }

    return createConnection({
      ...config,
      // waitForConnections: true,
      // connectionLimit: 10,
      // maxIdle: 10, // max idle connections, the default value is the same as `connectionLimit`
      // idleTimeout: 60000, // idle connections timeout, in milliseconds, the default value 60000
      // queueLimit: 0,
      debug: this.options.debug,
      trace: this.options.trace,
      charset: 'utf8',
      connectTimeout: 60000
    })
  }

  getConnection(catalog: string): Connection {
    if (!this.#connection) {
      this.#connection = this.createConnection(catalog)
    }

    return this.#connection
  }

  async query(connection: Connection | Pool, statment: string, values?: any) {
    return new Promise((resolve, reject) => {
      const callback = (error, results, fields) => {
        if (error) {
          reject(error)
          return
        }

        resolve({
          status: 'OK',
          data: results,
          columns: fields
        })
      }

      connection.query(
        {
          sql: statment,
          timeout: this.options.queryTimeout || 60000 * 60, // 1h
          values
        },
        callback
      )
    })
  }

  async runQuery(query: string, options?: QueryOptions): Promise<any> {
    const connection = this.getConnection(options?.catalog ?? this.options.catalog)
    return await this.query(connection, query)
  }

  async getCatalogs(): Promise<IDSSchema[]> {
    const query =
      "SELECT SCHEMA_NAME FROM `information_schema`.`SCHEMATA` WHERE SCHEMA_NAME NOT IN ('information_schema', 'performance_schema', 'mysql', 'sys')"
    const { data } = await this.runQuery(query)
    return data.map((row: any) => ({
      name: row.SCHEMA_NAME
    }))
  }

  async getSchema(catalog?: string, tableName?: string): Promise<IDSSchema[]> {
    let query = ''
    const tableSchema = catalog
      ? `A.\`table_schema\` = '${catalog}'`
      : `A.\`table_schema\` NOT IN ('information_schema', 'performance_schema', 'mysql', 'sys')`
    if (tableName) {
      query =
        'SELECT A.`table_schema` AS `table_schema`, A.`table_name` AS `table_name`, A.`table_type` AS `table_type`, ' +
        'A.`table_comment` AS `table_comment`, C.`column_name` AS `column_name`, C.`data_type` AS `data_type`, ' +
        'C.`column_comment` AS `column_comment` FROM `information_schema`.`tables` AS A join ' +
        '`information_schema`.`columns` AS C ON A.`table_schema` = C.`table_schema` ' +
        'AND A.`table_name` = C.`table_name` WHERE ' +
        tableSchema +
        ` AND A.\`table_name\` = '${tableName}'`
    } else {
      query =
        'SELECT `table_schema` AS `table_schema`, `table_name` AS `table_name`, `table_type` AS `table_type`, ' +
        '`table_comment` AS `table_comment` FROM `information_schema`.`tables` AS A WHERE ' +
        tableSchema
    }

    const { data } = await this.runQuery(query)
    return convertMySQLSchema(data)
  }

  async describe(catalog: string, statement: string) {
    if (!statement) {
      return { columns: [] }
    }

    statement = `${statement} LIMIT 1`
    return await this.runQuery(statement, { catalog })
  }

  async createCatalog(catalog: string) {
    // 用 `CREATE DATABASE` 使其适用于 Doris ？
    const query = `CREATE DATABASE IF NOT EXISTS \`${catalog}\``
    await this.runQuery(query)
  }

  /**
   * Import data into db
   * * Create table if not exist
   *
   * @param params
   * @returns
   */
  async import(params: CreationTable, options?: { catalog?: string }): Promise<void> {
    const { name, columns, data, file, format, mergeType } = params

    const database = options?.catalog ?? this.options?.catalog
    const connection = this.getConnection(database)

    const statements = []
    try {
      // Recreate table when append mode
      if (mergeType === 'DELETE') {
        const keys = columns.filter(({ isKey }) => isKey).map(({ fieldName }) => `\`${fieldName}\``)
        if (!keys.length) {
          throw new Error(`Olap table should use key fields for 'DISTRIBUTED BY HASH'`)
        }
        const dropTableStatement = `DROP TABLE IF EXISTS \`${name}\``
        const createTableStatement = `CREATE TABLE IF NOT EXISTS \`${name}\` (${columns
          .map((col) => `\`${col.fieldName}\` ${typeToStarrocksDB(col.type, col.length, col.fraction)}`)
          .join(', ')}) UNIQUE KEY (${keys.join(',')}) COMMENT "${name}" DISTRIBUTED BY HASH(${keys.join(
          ','
        )}) BUCKETS 10 PROPERTIES("replication_num" = "1")`
        statements.push(dropTableStatement)
        statements.push(createTableStatement)
        await this.query(connection, dropTableStatement)
        await this.query(connection, createTableStatement)
      }

      if (format && format !== 'data') {
        return await this.streamLoad(database, name, file, params)
      }

      const values = data.map((row) => columns.map(({ name }) => row[name]))
      const insertStatement = `INSERT INTO \`${name}\` (${columns
        .map(({ fieldName }) => `\`${fieldName}\``)
        .join(',')}) VALUES ?`
      statements.push(insertStatement)
      await this.query(connection, insertStatement, [values])
    } catch (err: any) {
      throw {
        message: err.message,
        stats: {
          statements
        }
      }
    } finally {
      // connection.end()
    }

    return null
  }

  async streamLoad(database: string, table: string, file: File, params: CreationTable) {
    const { host, apiHost, apiPort, use_ssl } = this.options
    const url = `${use_ssl ? 'https' : 'http'}://${apiHost || host}:${
      apiPort || '8030'
    }/api/${database}/${table}/_stream_load`
    let fileStream = file.buffer ? Readable.from(file.buffer) : file.stream
    const authorization = Buffer.from(`${this.options.username}:${this.options.password}`).toString('base64')
    const headers: any = {
      Authorization: `Basic ${authorization}`,
      columns: params.columns.map(({ fieldName }) => fieldName).join(','),
      format: params.format
    }
    if (params.format === 'csv') {
      headers.column_separator = params.columnSeparator || ','
      if (params.withHeader) {
        if (this.type === DORIS_TYPE) {
          headers.format = 'csv_with_names'
        } else {
          // for Starrocks
          headers.skip_header = 1
          if (this.options.version < 3) {
            fileStream = fileStream.pipe(new SkipHeaderTransformStream())
          }
        }
      } else {
        // for Starrocks
        headers.skip_header = 0
      }
      // for Starrocks
      headers.Expect = '100-continue'
    } else if (params.format === 'json') {
      headers.strict_mode = true
    }
    const result = await axios.put(url, fileStream, {
      headers,
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    })

    if (result.status === 200) {
      if (result.data.Status === 'Success') {
        return result.data
      } else {
        throw new Error(result.data.Message)
      }
    }

    throw new Error(result.data.Message)
  }
  
  async teardown() {
    this.#connection?.destroy()
  }
}

export class StarRocksRunner extends DorisRunner {
  readonly name: string = 'StarRocks'
  readonly type: string = STARROCKS_TYPE

  /**
   * Import data into db
   * * Create table if not exist
   *
   * @param params
   * @returns
   */
  async import(params: CreationTable, options?: { catalog?: string }): Promise<void> {
    const { name, columns, data, file, format, mergeType } = params

    // Connection
    const database = options?.catalog ?? this.options?.catalog
    const connection = this.getConnection(database)

    const statements = []
    try {
      // Recreate table when append mode
      if (mergeType === 'DELETE') {
        // Must set key fields for 'DISTRIBUTED BY HASH'
        const keys = columns.filter(({ isKey }) => isKey).map(({ fieldName }) => `\`${fieldName}\``)
        if (!keys.length) {
          throw new Error(`Olap table should use key fields for 'DISTRIBUTED BY HASH'`)
        }

        const dropTableStatement = `DROP TABLE IF EXISTS \`${name}\``
        const createTableStatement = `CREATE TABLE IF NOT EXISTS \`${name}\` (${columns
          .map((col) => `\`${col.fieldName}\` ${typeToStarrocksDB(col.type, col.length)}`)
          .join(', ')}) PRIMARY KEY (${keys.join(',')}) COMMENT "${name}" DISTRIBUTED BY HASH(${keys.join(
          ','
        )}) BUCKETS 10 PROPERTIES("replication_num" = "1")`
        statements.push(dropTableStatement)
        statements.push(createTableStatement)
        await this.query(connection, dropTableStatement)
        await this.query(connection, createTableStatement)
      }

      // File stream load
      if (format && format !== 'data') {
        return await this.streamLoad(database, name, file, params)
      }

      // Insert data using batch sql
      const values = data.map((row) => columns.map(({ name }) => row[name]))
      const insertStatement = `INSERT INTO \`${name}\` (${columns
        .map(({ fieldName }) => `\`${fieldName}\``)
        .join(',')}) VALUES ?`

      statements.push(insertStatement)
      await this.query(connection, insertStatement, [values])
    } catch (err: any) {
      throw {
        message: err.message,
        stats: {
          statements
        }
      }
    } finally {
      // connection.end()
    }

    return null
  }
}

register(DORIS_TYPE, DorisRunner)
register(STARROCKS_TYPE, StarRocksRunner)
