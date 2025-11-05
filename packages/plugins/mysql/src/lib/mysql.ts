import { Connection, Pool, createConnection, FieldPacket, Types, ConnectionOptions } from 'mysql2'
import { BaseSQLQueryRunner, DBProtocolEnum, DBSyntaxEnum, getErrorMessage, IDSSchema, QueryOptions, SQLAdapterOptions } from '@xpert-ai/plugin-sdk'
import { groupBy, pick } from 'lodash-es'
import { MySQLDataSource } from './types'

export const MYSQL_TYPE = MySQLDataSource

export interface MysqlAdapterOptions extends SQLAdapterOptions {
  queryTimeout?: number
  timezone?: string
  serverTimezone?: string
}

const MYSQL_DEFAULT_PORT = 3306

export class MySQLRunner<T extends MysqlAdapterOptions = MysqlAdapterOptions> extends BaseSQLQueryRunner<T> {
  override readonly name: string = 'MySQL'
  override readonly type: string = MYSQL_TYPE
  override readonly syntax = DBSyntaxEnum.SQL
  override readonly protocol = DBProtocolEnum.SQL

  override readonly jdbcDriver: string = 'com.mysql.jdbc.Driver'
  override jdbcUrl(schema?: string) {
    return `jdbc:mysql://${this.options.host}:${this.options.port || MYSQL_DEFAULT_PORT}/${schema}?${this.options.serverTimezone ? `serverTimezone=${this.options.serverTimezone}&` : ''}user=${encodeURIComponent(
      this.options.username as string
    )}&password=${encodeURIComponent(this.options.password as string)}`
  }

  override get configurationSchema() {
    return {
      type: 'object',
      properties: {
        host: { type: 'string' },
        port: { type: 'number', default: MYSQL_DEFAULT_PORT },
        username: { type: 'string', title: 'Username' },
        password: { type: 'string', title: 'Password' },
        // 目前 catalog 用于指定数据库
        catalog: { type: 'string', title: 'Database' },
        timezone: { type: 'string', title: 'Timezone', default: '+08:00' },
        serverTimezone: { type: 'string', title: 'Server Timezone', default: 'Asia/Shanghai' },
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
      order: ['host', 'port', 'username', 'password'],
      required: ['username', 'password'],
      secret: ['password']
    }
  }

  #connection = null
  protected createConnection(database?: string) {
    const config: ConnectionOptions = pick(this.options, ['host', 'port', 'password', 'database'])
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
    if (this.options.timezone) {
      config.timezone = this.options.timezone
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
      const callback = (error, results, fields: FieldPacket[]) => {
        if (error) {
          reject(new Error(getErrorMessage(error)))
          return
        }

        resolve({
          status: 'OK',
          data: results,
          columns: fields?.map((field) => ({
            name: field.name,
            type: MySQLTypeMap[field.columnType],
            dataType: Types[field.columnType]
          }))
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

    const { data } = await this.runQuery(query, { catalog })
    return convertMySQLSchema(data)
  }

  override async describe(catalog: string, statement: string) {
    if (!statement) {
      return { columns: [] }
    }

    statement = `${statement} LIMIT 1`
    return await this.runQuery(statement, { catalog })
  }

  async createCatalog(catalog: string) {
    // 用 `CREATE DATABASE` 使其适用于 Doris ？
    const query = `CREATE DATABASE IF NOT EXISTS \`${catalog}\``
    await this.runQuery(query, { catalog })
  }

  /**
   * Import data into db
   * * Create table if not exist
   *
   * @param params
   * @returns
   */
  override async import(params, options?: { catalog?: string }): Promise<void> {
    const { name, columns, data, append } = params

    const connection = this.getConnection(options?.catalog ?? this.options?.catalog)

    const dropTableStatement = `DROP TABLE IF EXISTS \`${name}\``
    const createTableStatement = `CREATE TABLE IF NOT EXISTS \`${name}\` (${columns
      .map(
        (col) =>
          `\`${col.fieldName}\` ${typeToMySqlDB(col.type, col.isKey, col.length)}${col.isKey ? ' PRIMARY KEY' : ''}`
      )
      .join(', ')})`
    const values = data.map((row) => columns.map(({ name }) => row[name]))
    const insertStatement = `INSERT INTO \`${name}\` (${columns
      .map(({ fieldName }) => `\`${fieldName}\``)
      .join(',')}) VALUES ?`
    try {
      if (!append) {
        await this.query(connection, dropTableStatement)
      }
      await this.query(connection, createTableStatement)
      await this.query(connection, insertStatement, [values])
    } catch (err: any) {
      throw {
        message: err.message,
        stats: {
          statements: [dropTableStatement, createTableStatement, insertStatement]
        }
      }
    } finally {
      connection.end()
    }

    return null
  }

  async teardown() {
    this.#connection?.destroy()
  }
}

export function convertMySQLSchema(data: Array<any>) {
  const schemas = groupBy(data, 'table_schema')
  return Object.keys(schemas).map((schema) => {
    const tableGroup = groupBy(schemas[schema], 'table_name')
    const tables = Object.keys(tableGroup).map((name) => {
      return {
        schema,
        name,
        label: tableGroup[name][0].table_comment,
        type: tableGroup[name][0].table_type,
        columns: tableGroup[name]
          .filter((item) => !!item.column_name)
          .map((item) => ({
            name: item.column_name,
            dataType: item.data_type,
            type: pgTypeMap(item.data_type),
            label: item.column_comment
          }))
      }
    })

    return {
      schema,
      name: schema,
      tables
    }
  })
}


export function typeToMySqlDB(type: string, isKey: boolean, length: number) {
  switch(type) {
    case 'number':
    case 'Number':
      return 'INT'
    case 'Numeric':
      return 'DOUBLE'
    case 'string':
    case 'String':
      // Max length 3072 btye for primary key
      if (length !== null && length !== undefined) {
        return isKey ? `VARCHAR(${Math.min(length, 768)})` : `VARCHAR(${length})`
      }
      return isKey ? 'VARCHAR(768)' : 'VARCHAR(1000)'
    case 'date':
    case 'Date':
      return 'DATE'
    case 'Datetime':
    case 'datetime':
      return 'DATETIME'
    case 'boolean':
    case 'Boolean':
      return 'BOOLEAN'
    default:
      return 'VARCHAR(1000)'
  }
}

export function pgTypeMap(type: string): 'string' | 'number' | 'timestamp' | 'object' {
  switch (type) {
    case 'numeric':
    case 'int':
    case 'int 4':
    case 'int4':
    case 'int 8':
    case 'int8':
    case 'integer':
    case 'float':
    case 'float 8':
    case 'float8':
    case 'double':
    case 'real':
    case 'bigint':
    case 'smallint':
    case 'double precision':
    case 'decimal':
      return 'number'
    case 'uuid':
    case 'varchar':
    case 'character varying':
    case 'longtext':
    case 'text':
      return 'string'
    case 'timestamp without time zone':
      return 'timestamp'
    case 'json':
      return 'object'
    default:
      return type as 'string'
  }
}

export const MySQLTypeMap = {
  0x01: 'number',
  0x02: 'number',
  0x03: 'number',
  0x04: 'number',
  0x05: 'number',
  0x06: 'null',
  0x07: 'Date',
  0x08: 'number', // 或 'BigInt'
  0x09: 'number',
  0x0a: 'Date',
  0x0b: 'string',
  0x0c: 'Date',
  0x0d: 'number',
  0xfd: 'string',
  0xfe: 'string',
  0xfc: 'Buffer'
}
