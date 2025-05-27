import { Connection, Pool, createConnection, FieldPacket, Types, ConnectionOptions } from 'mysql2'
import { BaseSQLQueryRunner, SQLAdapterOptions, register } from '../../base'
import { convertMySQLSchema, pick, typeToMySqlDB } from '../../helpers'
import { DBProtocolEnum, DBSyntaxEnum, IDSSchema, QueryOptions } from '../../types'
import { MySQLTypeMap } from './types'

export const MYSQL_TYPE = 'mysql'
export const RDS_TYPE = 'rds_mysql'

export interface MysqlAdapterOptions extends SQLAdapterOptions {
  queryTimeout?: number
  timezone?: string
  serverTimezone?: string
}

export class MySQLRunner<T extends MysqlAdapterOptions = MysqlAdapterOptions> extends BaseSQLQueryRunner<T> {
  readonly name: string = 'MySQL'
  readonly type: string = MYSQL_TYPE
  readonly syntax = DBSyntaxEnum.SQL
  readonly protocol = DBProtocolEnum.SQL

  readonly jdbcDriver = 'com.mysql.jdbc.Driver'
  jdbcUrl(schema?: string) {
    return `jdbc:mysql://${this.options.host}:${this.options.port}/${schema}?${this.options.serverTimezone ? `serverTimezone=${this.options.serverTimezone}&` : ''}user=${encodeURIComponent(
      this.options.username as string
    )}&password=${encodeURIComponent(this.options.password as string)}`
  }

  get configurationSchema() {
    return {
      type: 'object',
      properties: {
        host: { type: 'string' },
        port: { type: 'number', default: 3306 },
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
          reject(error)
          return
        }

        resolve({
          status: 'OK',
          data: results,
          columns: fields.map((field) => ({
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
  async import(params, options?: { catalog?: string }): Promise<void> {
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

export class RDSMySQLRunner extends MySQLRunner {
  readonly name: string = 'MySQL (Amazon RDS)'
  readonly type: string = RDS_TYPE
}

register(MYSQL_TYPE, MySQLRunner)
register(RDS_TYPE, RDSMySQLRunner)