import { Connection, Pool, createConnection, FieldPacket, Types, ConnectionOptions } from 'mysql2'
import { DBCreateTableMode, DBTableAction, DBTableOperationParams } from '@xpert-ai/plugin-sdk'
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

const MYSQL_DEFAULT_PORT = 3306

export class MySQLRunner<T extends MysqlAdapterOptions = MysqlAdapterOptions> extends BaseSQLQueryRunner<T> {
  readonly name: string = 'MySQL'
  readonly type: string = MYSQL_TYPE
  readonly syntax = DBSyntaxEnum.SQL
  readonly protocol = DBProtocolEnum.SQL

  readonly jdbcDriver: string = 'com.mysql.jdbc.Driver'
  jdbcUrl(schema?: string) {
    return `jdbc:mysql://${this.options.host}:${this.options.port || MYSQL_DEFAULT_PORT}/${schema}?${this.options.serverTimezone ? `serverTimezone=${this.options.serverTimezone}&` : ''}user=${encodeURIComponent(
      this.options.username as string
    )}&password=${encodeURIComponent(this.options.password as string)}`
  }

  get configurationSchema() {
    return {
      type: 'object',
      properties: {
        host: { type: 'string' },
        port: { type: 'number', default: MYSQL_DEFAULT_PORT },
        username: { type: 'string', title: 'Username' },
        password: { type: 'string', title: 'Password' },
        // catalog is used to specify the database
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

  async describe(catalog: string, statement: string) {
    if (!statement) {
      return { columns: [] }
    }

    statement = `${statement} LIMIT 1`
    return await this.runQuery(statement, { catalog })
  }

  async createCatalog(catalog: string) {
    // Use `CREATE DATABASE` to make it compatible with Doris
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
  async import(params, options?: { catalog?: string }): Promise<void> {
    const { name, columns, data, append } = params

    const connection = this.getConnection(options?.catalog ?? this.options?.catalog)

    const dropTableStatement = `DROP TABLE IF EXISTS \`${name}\``
    const createTableStatement = `CREATE TABLE IF NOT EXISTS \`${name}\` (${columns
      .map(
        (col) =>
          `\`${col.fieldName}\` ${typeToMySqlDB(col.type, col.isKey, col.length, undefined, undefined, col.enumValues, col.setValues)}${col.isKey ? ' PRIMARY KEY' : ''}`
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

  /**
   * Table operations
   */
  async tableOp(
    action: DBTableAction,
    params: any,
  ): Promise<any> {
    switch(action) {
      case DBTableAction.CREATE_TABLE: {
        const { schema, table, columns, createMode = DBCreateTableMode.ERROR } = params
        const tableName = schema ? `\`${schema}\`.\`${table}\`` : `\`${table}\``

        // Check if table exists
        const existsResult = await this.runQuery(`
          SELECT TABLE_NAME 
          FROM INFORMATION_SCHEMA.TABLES 
          WHERE TABLE_SCHEMA = '${schema || this.options.catalog || 'public'}'
            AND TABLE_NAME = '${table}'
        `)

        const exists = existsResult.data && existsResult.data.length > 0

        // --- MODE: ERROR → throw error if table exists ---
        if (exists && createMode === DBCreateTableMode.ERROR) {
          throw new Error(`Table "${tableName}" already exists`)
        }

        // --- MODE: IGNORE → do nothing if exists ---
        if (exists && createMode === DBCreateTableMode.IGNORE) {
          return
        }

        // --- MODE: UPGRADE → automatically upgrade columns ---
        if (exists && createMode === DBCreateTableMode.UPGRADE) {
          // Get current table structure
          const currentCols = await this.runQuery(`
            SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = '${schema || this.options.catalog || 'public'}'
              AND TABLE_NAME = '${table}'
          `)

          // 1. Delete columns not in target list
          const targetColumnNames = columns.map(c => c.fieldName)
          for (const currentCol of currentCols.data) {
            const colName = (currentCol as any).COLUMN_NAME
            if (!targetColumnNames.includes(colName)) {
              await this.runQuery(`ALTER TABLE ${tableName} DROP COLUMN \`${colName}\``)
            }
          }

          // 2. Compare columns, add/modify fields
          for (const col of columns) {
            const existing = currentCols.data.find((c: any) => c.COLUMN_NAME === col.fieldName)

            // New field → ADD COLUMN
            if (!existing) {
              const typeDDL = typeToMySqlDB(col.type, col.isKey, col.length, col.precision, col.scale || col.fraction, col.enumValues, col.setValues)
              // Support AUTO_INCREMENT for all integer types
              const integerTypes = ['tinyint', 'smallint', 'mediumint', 'number', 'int', 'integer', 'bigint']
              const autoInc = col.autoIncrement && integerTypes.includes(col.type.toLowerCase()) ? ' AUTO_INCREMENT' : ''
              const notNull = col.required ? ' NOT NULL' : ''
              const unique = !col.isKey && col.unique ? ' UNIQUE' : ''
              
              // MySQL limitation: DATE and TIME types do not support default value functions
              let defaultVal = ''
              if (!col.autoIncrement && col.defaultValue && col.defaultValue.trim()) {
                // Skip default value for DATE and TIME types to avoid MySQL errors
                if (col.type !== 'date' && col.type !== 'time') {
                  defaultVal = ` DEFAULT ${this.formatDefaultValue(col.defaultValue, col.type)}`
                }
              }
              
            // MySQL column order: type AUTO_INCREMENT PRIMARY KEY NOT NULL UNIQUE DEFAULT
            const addColSQL = `ALTER TABLE ${tableName} ADD COLUMN \`${col.fieldName}\` ${typeDDL}${autoInc}${notNull}${unique}${defaultVal}`
            await this.runQuery(addColSQL)
            continue
            }

            // Field exists, check if type needs to be updated
            const dbDataType = existing.DATA_TYPE.toUpperCase()
            const newType = typeToMySqlDB(col.type, col.isKey, col.length, col.precision, col.scale || col.fraction, col.enumValues, col.setValues)
            const oldAppType = this.mysqlTypeToAppType(dbDataType)
            const newAppType = col.type

            if (oldAppType !== newAppType) {
              // When modifying column type, include all constraints
              // Support AUTO_INCREMENT for all integer types
              const integerTypes = ['tinyint', 'smallint', 'mediumint', 'number', 'int', 'integer', 'bigint']
              const autoInc = col.autoIncrement && integerTypes.includes(col.type.toLowerCase()) ? ' AUTO_INCREMENT' : ''
              const notNull = col.required ? ' NOT NULL' : ''
              const unique = !col.isKey && col.unique ? ' UNIQUE' : ''
              
              // MySQL limitation: DATE and TIME types do not support default value functions
              let defaultVal = ''
              if (!col.autoIncrement && col.defaultValue && col.defaultValue.trim()) {
                if (col.type !== 'date' && col.type !== 'time') {
                  defaultVal = ` DEFAULT ${this.formatDefaultValue(col.defaultValue, col.type)}`
                }
              }
              
              await this.runQuery(`ALTER TABLE ${tableName} MODIFY COLUMN \`${col.fieldName}\` ${newType}${autoInc}${notNull}${unique}${defaultVal}`)
            }
          }

          return
        }

        // --- MODE: CREATE NEW TABLE ---
        const createTableStatement = `
          CREATE TABLE IF NOT EXISTS ${tableName} (
            ${columns
              .map((col) => {
                const typeDDL = typeToMySqlDB(col.type, col.isKey, col.length, col.precision, col.scale || col.fraction, col.enumValues, col.setValues)
                const pk = col.isKey ? ' PRIMARY KEY' : ''
                // Support AUTO_INCREMENT for all integer types
                const integerTypes = ['tinyint', 'smallint', 'mediumint', 'number', 'int', 'integer', 'bigint']
                const autoInc = col.autoIncrement && integerTypes.includes(col.type.toLowerCase()) ? ' AUTO_INCREMENT' : ''
                const notNull = col.required ? ' NOT NULL' : ''
                const unique = !col.isKey && col.unique ? ' UNIQUE' : ''
                
                // MySQL limitation: DATE and TIME types do not support default values
                let defaultVal = ''
                if (!col.autoIncrement && col.defaultValue && col.defaultValue.trim()) {
                  if (col.type !== 'date' && col.type !== 'time') {
                    defaultVal = ` DEFAULT ${this.formatDefaultValue(col.defaultValue, col.type)}`
                  }
                }
                
                // MySQL column order: type AUTO_INCREMENT PRIMARY KEY NOT NULL UNIQUE DEFAULT
                const columnDef = `\`${col.fieldName}\` ${typeDDL}${autoInc}${pk}${notNull}${unique}${defaultVal}`
                return columnDef
              })
              .join(', ')}
          )
        `

        await this.runQuery(createTableStatement, { catalog: schema })
        return
      }
      case DBTableAction.RENAME_TABLE: {
        // Rename table
        const { schema, table, newTable } = params
        const oldTableName = schema ? `\`${schema}\`.\`${table}\`` : `\`${table}\``
        const newTableName = `\`${newTable}\``
        
        await this.runQuery(`RENAME TABLE ${oldTableName} TO ${newTableName}`, { catalog: schema })
        return
      }
      case DBTableAction.DROP_TABLE: {
        // Drop table
        const { schema, table } = params
        const tableName = schema ? `\`${schema}\`.\`${table}\`` : `\`${table}\``
        
        await this.runQuery(`DROP TABLE IF EXISTS ${tableName}`, { catalog: schema })
        return
      }
      default:
        // Throw error for other unimplemented operations
        throw new Error(`Unsupported table action: ${action}`)
    }
  }

  /**
   * Format default value for SQL
   */
  private formatDefaultValue(value: string, type: string): string {
    // Check if it's a database function (e.g., CURRENT_TIMESTAMP)
    const upperValue = value.toUpperCase()
    
    // MySQL time type default value function mapping
    const timeFunctions = {
      'CURRENT_DATE': true,
      'CURRENT_TIME': true,
      'CURRENT_TIMESTAMP': true,
      'NOW()': true,
      'CURDATE()': true,
      'CURTIME()': true,
      'LOCALTIME': true,
      'LOCALTIMESTAMP': true
    }
    
    if (timeFunctions[upperValue]) {
      return upperValue  // Return function name directly without quotes
    }
    
    // Add quotes for string, date, and time types
    if (type === 'string' || type === 'text' || type === 'uuid' || type === 'varchar' ||
        type === 'date' || type === 'datetime' || type === 'timestamp' || type === 'time') {
      return `'${value.replace(/'/g, "\\'")}'`  // Escape single quotes
    }
    
    if (type === 'boolean' || type === 'bool') {
      return value.toLowerCase() === 'true' ? '1' : '0'  // MySQL uses 1/0 for boolean values
    }
    
    // Numeric types without quotes
    return value
  }

  /**
   * Map MySQL database type back to application type
   */
  private mysqlTypeToAppType(dbType: string): string {
    const upperType = dbType.toUpperCase()
    
    // Integer types
    if (upperType === 'TINYINT') {
      // Check if it's TINYINT(1) which is typically used for boolean
      if (dbType.includes('(1)')) {
        return 'boolean'
      }
      return 'tinyint'
    }
    if (upperType === 'SMALLINT') {
      return 'smallint'
    }
    if (upperType === 'MEDIUMINT') {
      return 'mediumint'
    }
    if (upperType === 'INT' || upperType === 'INTEGER') {
      return 'number'
    }
    if (upperType === 'BIGINT') {
      return 'bigint'
    }
    
    // Floating point types
    if (upperType.includes('FLOAT')) {
      return 'float'
    }
    if (upperType.includes('DOUBLE')) {
      return 'double'
    }
    if (upperType.includes('DECIMAL') || upperType.includes('NUMERIC')) {
      return 'decimal'
    }
    
    // String types - Fixed/Variable length
    if (upperType.includes('CHAR') && !upperType.includes('VARCHAR')) {
      return 'char'
    }
    if (upperType.includes('VARCHAR')) {
      return 'string'
    }
    
    // String types - Text
    if (upperType === 'TINYTEXT') {
      return 'tinytext'
    }
    if (upperType === 'TEXT') {
      return 'text'
    }
    if (upperType === 'MEDIUMTEXT') {
      return 'mediumtext'
    }
    if (upperType === 'LONGTEXT') {
      return 'longtext'
    }
    
    // String types - Binary
    if (upperType === 'TINYBLOB') {
      return 'tinyblob'
    }
    if (upperType === 'BLOB') {
      return 'blob'
    }
    if (upperType === 'MEDIUMBLOB') {
      return 'mediumblob'
    }
    if (upperType === 'LONGBLOB') {
      return 'longblob'
    }
    
    // String types - Special
    if (upperType.includes('ENUM')) {
      return 'enum'
    }
    if (upperType.includes('SET')) {
      return 'set'
    }
    
    // Date and time types
    if (upperType === 'DATE') {
      return 'date'
    }
    if (upperType === 'TIME') {
      return 'time'
    }
    if (upperType === 'DATETIME') {
      return 'datetime'
    }
    if (upperType === 'TIMESTAMP') {
      return 'timestamp'
    }
    if (upperType === 'YEAR') {
      return 'year'
    }
    
    // JSON types
    if (upperType.includes('JSON')) {
      return 'object'
    }
    
    // Spatial types
    if (upperType === 'GEOMETRY') {
      return 'geometry'
    }
    if (upperType === 'POINT') {
      return 'point'
    }
    if (upperType === 'LINESTRING') {
      return 'linestring'
    }
    if (upperType === 'POLYGON') {
      return 'polygon'
    }
    if (upperType === 'MULTIPOINT') {
      return 'multipoint'
    }
    if (upperType === 'MULTILINESTRING') {
      return 'multilinestring'
    }
    if (upperType === 'MULTIPOLYGON') {
      return 'multipolygon'
    }
    if (upperType === 'GEOMETRYCOLLECTION') {
      return 'geometrycollection'
    }
    
    // Boolean types
    if (upperType.includes('BOOL')) {
      return 'boolean'
    }
    
    return 'string'  // Default fallback
  }

  async teardown() {
    this.#connection?.destroy()
  }
}

export class RDSMySQLRunner extends MySQLRunner {
  readonly name: string = 'MySQL (Amazon RDS)'
  readonly type: string = RDS_TYPE
}

// register(MYSQL_TYPE, MySQLRunner)
// register(RDS_TYPE, RDSMySQLRunner)

function getErrorMessage(err: any): string {
  let error: string
  if (typeof err === 'string') {
    error = err
  } else if (err && (err.name === "AggregateError" || err.constructor.name === "AggregateError")) {
    return err.errors.map((_) => getErrorMessage(_)).join('\n\n')
  } else if (err instanceof Error) {
    error = err?.message
  } else if (err?.error instanceof Error) {
    error = err?.error?.message
  } else if(err?.message) {
    error = err?.message
  } else if (err) {
    // If there is no other way, convert it to JSON string
    error = JSON.stringify(err)
  }

  return error
}