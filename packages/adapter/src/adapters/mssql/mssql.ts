import * as sql from 'mssql'
import { BaseSQLQueryRunner, SQLAdapterOptions, register } from '../../base'
import { DBProtocolEnum, DBSyntaxEnum, IDSSchema, QueryOptions, QueryResult } from '../../types'

export const MSSQL_TYPE = 'mssql'

export interface MssqlAdapterOptions extends SQLAdapterOptions {
  database?: string
  queryTimeout?: number
}

export type TMSSQLResult = {
  recordset: any[]
  recordsets: any[][]
  output: any
  rowsAffected: [number]
}

export class MSSQLRunner<T extends MssqlAdapterOptions = MssqlAdapterOptions> extends BaseSQLQueryRunner<T> {
  readonly name: string = 'MSSQL'
  readonly type: string = MSSQL_TYPE
  readonly syntax = DBSyntaxEnum.SQL
  readonly protocol = DBProtocolEnum.SQL

  readonly jdbcDriver = 'com.microsoft.sqlserver.jdbc.SQLServerDriver'
  jdbcUrl(schema?: string) {
    return `jdbc:sqlserver://${this.options.host}:${this.options.port};databaseName=${this.options.database};user=${this.options.username as string};password=${this.options.password as string};encrypt=false;`
  }

  get configurationSchema() {
    return {
      type: 'object',
      properties: {
        host: { type: 'string' },
        port: { type: 'number', default: 0 },
        username: { type: 'string', title: 'Username' },
        password: { type: 'string', title: 'Password' },
      
        database: { type: 'string', title: 'Database' },
     
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
      order: ['host', 'port', 'database', 'username', 'password'],
      required: ['username', 'password', 'database'],
      secret: ['password']
    }
  }

  #connection = null

  async getConnection(database: string) {
    const sqlConfig = {
        user: this.options.username,
        password: this.options.password,
        database: this.options.database,
        server: this.options.host,
        port: this.options.port,
        pool: {
          max: 10,
          min: 0,
          idleTimeoutMillis: 30000
        },
        options: {
          encrypt: this.options.use_ssl, // for azure
          trustServerCertificate: !this.options.use_ssl // change to true for local dev / self-signed certs
        }
      }

      await sql.connect(sqlConfig)
  }

  async query<T>(statment: string, values?: any) {
    await this.getConnection(null)
    return sql.query(statment, values) as T
  }

  async runQuery<T = unknown>(query: string, options?: QueryOptions): Promise<QueryResult<T>> {
    const result = await this.query<TMSSQLResult>(query)
    return {
      status: "OK",
      data: result.recordset,
      columns: result.recordset.length > 0 ? Object.keys(result.recordset[0]).map(name => ({ name, type: typeof result.recordset[0][name] })) : []
    } as QueryResult<T>
  }

  async getCatalogs(): Promise<IDSSchema[]> {
    const query =
      `SELECT name FROM sys.schemas`
    const { data } = await this.runQuery<{name: string}>(query)
    console.log(data)
    return data.map(db => {
      return {
        name: db.name
      }
    })
  }

  async getSchema(schema?: string, tableName?: string): Promise<IDSSchema[]> {
    const catalog = this.options.database
    let query = ''
    const tableSchema = catalog
      ? `TABLE_CATALOG = '${catalog}'`
      : `TABLE_CATALOG NOT IN ('master', 'tempdb', 'model', 'msdb')`
    if (tableName) {
      query =
        'SELECT TABLE_CATALOG AS table_catalog, TABLE_SCHEMA AS table_schema, TABLE_NAME AS table_name, ' +
        'COLUMN_NAME AS column_name, DATA_TYPE AS data_type ' +
        'FROM INFORMATION_SCHEMA.COLUMNS ' +
        'WHERE ' + tableSchema + ` AND TABLE_NAME = '${tableName}'` +
        (schema ? ` AND TABLE_SCHEMA = '${schema}'` : '')
    } else {
      query =
        'SELECT TABLE_CATALOG AS table_catalog, TABLE_SCHEMA AS table_schema, TABLE_NAME AS table_name, TABLE_TYPE AS table_type ' +
        'FROM INFORMATION_SCHEMA.TABLES ' +
        'WHERE ' + tableSchema +
        (schema ? ` AND TABLE_SCHEMA = '${schema}'` : '')
    }

    const { data } = await this.runQuery<any>(query)
    const schemaMap = new Map()

    data.forEach(row => {
      if (!schemaMap.has(row.table_schema)) {
        schemaMap.set(row.table_schema, {
          catalog: row.table_catalog,
          schema: row.table_schema,
          tables: []
        })
      }
      const schema = schemaMap.get(row.table_schema)
      const table = schema.tables.find(t => t.name === row.table_name)

      if (table) {
        if (row.column_name) {
          table.columns.push({ name: row.column_name, type: row.data_type })
        }
      } else {
        schema.tables.push({
          name: row.table_name,
          type: row.table_type,
          columns: row.column_name ? [{ name: row.column_name, type: row.data_type }] : []
        })
      }
    })

    return Array.from(schemaMap.values())
  }

  async describe(catalog: string, statement: string) {
    if (!statement) {
      return { columns: [] }
    }

    statement = `${statement} LIMIT 1`
    return await this.runQuery(statement, { catalog })
  }

  /**
   * Create schema if not exists
   * 
   * @param schema 
   */
  async createCatalog(schema: string) {
    // Check if the schema exists
    const checkQuery = `SELECT schema_name FROM information_schema.schemata WHERE schema_name = '${schema}'`
    const { data } = await this.runQuery(checkQuery)

    // If the schema does not exist, throw an error
    if (data.length === 0) {
      throw new Error(`Schema "${schema}" does not exist.`)
    }
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
    const catalog = options?.catalog ?? this.options?.catalog

    const connection = this.getConnection(options?.catalog ?? this.options?.catalog)

    const dropTableStatement = `DROP TABLE IF EXISTS "${name}"`
    const createTableStatement = `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = '${name}' AND SCHEMA_NAME(schema_id) = '${catalog}')
BEGIN
  CREATE TABLE [${catalog}].[${name}] (
    ${columns
      .map(
        (col) =>
          `[${col.fieldName}] ${typeToMSTypeStr(col.type, col.isKey, col.length)}${col.isKey ? ' PRIMARY KEY' : ''}`
      )
      .join(',\n')}
  )
END`

    try {
      if (!append) {
        await this.query(dropTableStatement)
      }
      await this.query(createTableStatement)
      

      const table = new sql.Table(`[${catalog}].[${name}]`)
      table.create = false // Set to false because the table is already created
      columns.forEach((col) => {
        // Add columns with appropriate types
        table.columns.add(col.fieldName, typeToMSType(col.type, col.isKey, col.length))
      })
  
      // Add rows to the table
      data.forEach(row => {
        const values = columns.map(({ fieldName }) => row[fieldName])
        table.rows.add(...values)
      })
  
      // Use request.bulk to insert data
      const request = new sql.Request()
      await request.bulk(table)
    } catch (err: any) {
      throw {
        message: err.message,
        stats: {
          statements: [dropTableStatement, createTableStatement]
        }
      }
    } finally {
    //   connection.end()
    }

    return null
  }

  async teardown() {
    this.#connection?.destroy()
  }
}

register(MSSQL_TYPE, MSSQLRunner)

// Helpers

export function typeToMSTypeStr(type: string, isKey: boolean, length: number) {
  switch(type) {
    case 'number':
    case 'Number':
      return 'INT'
    case 'Numeric':
      return 'FLOAT'
    case 'string':
    case 'String':
      if (length !== null && length !== undefined) {
        return `VARCHAR(${length})`
      }
      return 'VARCHAR(1000)'
    case 'date':
    case 'Date':
      return 'DATE'
    case 'Datetime':
    case 'datetime':
      return 'DATETIME'
    case 'boolean':
    case 'Boolean':
      return 'BIT'
    default:
      return 'VARCHAR(1000)'
  }
}

export function typeToMSType(type: string, isKey: boolean, length: number) {
  switch(type) {
    case 'number':
    case 'Number':
      return sql.Int
    case 'Numeric':
      return sql.Float
    case 'string':
    case 'String':
      if (length !== null && length !== undefined) {
        return sql.VarChar(length)
      }
      return sql.VarChar(1000)
    case 'date':
    case 'Date':
      return sql.Date
    case 'Datetime':
    case 'datetime':
      return sql.DateTime
    case 'boolean':
    case 'Boolean':
      return sql.Bit
    default:
      return sql.VarChar(1000)
  }
}