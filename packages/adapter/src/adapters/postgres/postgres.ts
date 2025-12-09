import { BaseSQLQueryRunner, DBCreateTableMode, DBTableAction, DBTableDataAction, DBTableDataParams, DBTableOperationParams, QueryOptions } from '@xpert-ai/plugin-sdk'
import { Client, ClientConfig, types } from 'pg'
import { SQLAdapterOptions, register } from '../../base'
import { convertPGSchema, getPGSchemaQuery, pgTypeMap, typeToPGDB } from '../../helpers'
import { CreationTable, DBProtocolEnum, DBSyntaxEnum, QueryResult, IDSSchema } from '../../types'
import { pgFormat } from './pg-format'


export const POSTGRES_TYPE = 'pg'

const TypesBuiltins = {}
Object.entries(types.builtins).forEach(([key, value]: [string, any]) => {
  TypesBuiltins[key] = value
  TypesBuiltins[value] = key
})

export interface PostgresAdapterOptions extends SQLAdapterOptions {
  sslmode?: string
  sslrootcertFile?: string
  sslkeyFile?: string
  sslcertFile?: string
  database?: string
}

export class PostgresRunner extends BaseSQLQueryRunner<PostgresAdapterOptions> {
  readonly name: string = 'Postgres'
  readonly type: string = POSTGRES_TYPE
  readonly syntax = DBSyntaxEnum.SQL
  readonly protocol = DBProtocolEnum.SQL

  readonly jdbcDriver: string = 'org.postgresql.Driver'

  jdbcUrl(schema?: string) {
    return `jdbc:postgresql://${this.host}:${this.port}/${this.options.database}?`+
    (schema?`currentSchema=${schema}&`:'')+
    `user=${encodeURIComponent(this.options.username as string)}&password=${encodeURIComponent(this.options.password as string)}`
  }

  get configurationSchema() {
    return {
      type: 'object',
      properties: {
        host: { type: 'string', default: '127.0.0.1' },
        port: { type: 'number', default: 5432 },
        username: { type: 'string', default: '' },
        password: { type: 'string' },
        database: { type: 'string', title: 'Database Name', default: 'postgres' },
        sslmode: {
          "type": "string",
          "title": "SSL Mode",
          "default": "prefer",
          "extendedEnum": [
              {"value": "disable", "name": "Disable"},
              {"value": "allow", "name": "Allow"},
              {"value": "prefer", "name": "Prefer"},
              {"value": "require", "name": "Require"},
              {"value": "verify-ca", "name": "Verify CA"},
              {"value": "verify-full", "name": "Verify Full"},
          ],
        },
        "sslrootcertFile": {"type": "textarea", "title": "SSL Root Certificate"},
        "sslcertFile": {"type": "textarea", "title": "SSL Client Certificate"},
        "sslkeyFile": {"type": "textarea", "title": "SSL Client Key"},
      },
      order: ['username', 'password', 'database'],
      required: ['database'],
      "secret": ["password", "sslrootcertFile", "sslcertFile", "sslkeyFile"],
      "extra_options": [
        "sslmode",
        "sslrootcertFile",
        "sslcertFile",
        "sslkeyFile",
    ],
    }
  }

  client: Client
  #clientConnected = false

  constructor(options: PostgresAdapterOptions) {
    super(options)

    const config = {
      user: this.options.username as string,
      host: (this.options.host || 'localhost') as string,
      database: (this.options.database || 'postgres') as string,
      password: this.options.password as string,
      port: (this.options.port || 5432) as number,
    } as ClientConfig

    switch(this.options.sslmode) {
      case 'verify-ca':
        config.ssl = {
          rejectUnauthorized: true,
          ca: this.options.sslrootcertFile as string,
        }
        break
      case 'require':
      case 'verify-full':
        config.ssl = {
          rejectUnauthorized: true,
          ca: this.options.sslrootcertFile as string,
          key: this.options.sslkeyFile as string,
          cert: this.options.sslcertFile as string,
        }
        break
    }
    this.client = new Client(config)
  }

  async connect() {
    if (!this.#clientConnected) {
      try {
        await this.client.connect()
      } finally {
        this.#clientConnected = true
      }
    }
  }

  async runQuery(query: string, options?: QueryOptions) {
    const { catalog, params } = options ?? {}

    await this.connect()

    if (catalog) {
      query = `SET search_path TO ${catalog};` + query
    }
    let res = await this.client.query(query, params)

    if (Array.isArray(res)) {
      res = res[(res as any).length - 1]
    }

    const columns = res.fields?.map(field => ({
      name: field.name,
      type: pgTypeMap(`${TypesBuiltins[field.dataTypeID]}`.toLowerCase()),
      dataType: `${TypesBuiltins[field.dataTypeID]}`.toLowerCase()
    }))
    const data = res.rows

    return {
      status: "OK",
      data,
      columns
    } as QueryResult
    
    // res.rows may have number type results as string values (e.g., sum(int8) becomes string)
    // columns.filter((column) => column.type === 'number' && typeof res.rows[0]?.[column.name] === 'string')
    //   .forEach((column) => {
    //     data.forEach((row) => row[column.name] = Number(row[column.name]))
    //   })
  }

  async getCatalogs(): Promise<IDSSchema[]> {
    const query =
      "SELECT nspname as name FROM pg_namespace WHERE nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast', 'pg_toast_temp_1', 'pg_temp_1')"
    return this.runQuery(query).then(({data}) =>
      data.map((row: any) => ({
        name: row.name,
      }))
    )
  }

  async getSchema(catalog?: string, tableName?: string): Promise<IDSSchema[]> {
    const query = getPGSchemaQuery(catalog, tableName)
    const result = await this.runQuery(query)
    return convertPGSchema(result.data)
  }

  async describe(catalog: string, statement: string) {
    if (!statement) {
      return {columns: []}
    }

    if (catalog) {
      statement = `SET search_path TO ${catalog};${statement} LIMIT 1`
    }
    return this.runQuery(statement)
  }

  override async createCatalog(catalog: string) {
    await this.runQuery(`CREATE SCHEMA IF NOT EXISTS ${catalog}`)
  }

  /**
   * Import data to a table
   * 
   * @param params 
   * @param options 
   */
  async import(params: CreationTable, options?: { catalog?: string }): Promise<void> {
    const { name, columns, data, mergeType } = params

    if (!data?.length) {
      throw new Error(`data is empty`)
    }

    const tableName = options?.catalog ? `"${options.catalog}"."${name}"` : `"${name}"`

    const dropTableStatement = `DROP TABLE IF EXISTS ${tableName}`
    const createTableStatement = `CREATE TABLE IF NOT EXISTS ${tableName} (${columns
      .map((col) => {
        const colAny = col as any
        return `"${col.fieldName}" ${typeToPGDB(col.type, col.isKey, col.length, colAny.precision, colAny.scale || col.fraction, colAny.enumValues)}${col.isKey ? ' PRIMARY KEY' : ''}`
      })
      .join(', ')})`
    const values = data.map((row, index) => columns.map(({ name, type, length }) => {
      if (row[name] instanceof Date) {
        if (type === 'Date') {
          return row[name].toISOString().slice(0, length ?? 10)
        } else if (type === 'Datetime') {
          return row[name].toISOString()
        } else if (type === 'Time') {
          return row[name].toISOString().slice(11, 19)
        }
        return length ? row[name].toISOString().slice(0, length) : row[name].toISOString()
      }
      if (type === 'Date' || type === 'Datetime') {
        try {
          const value = new Date(row[name]).toISOString()
          return type === 'Datetime' ? value : value.slice(0, length ?? 10)
        } catch(err) {
          throw new Error(`Converting the value '${row[name]}' in row ${index} column '${name}' to date: ${(<Error>err).message}`)
        }
      }
      return row[name]
    }))
    const batchSize = 10000; // Define batch size
    let insertStatement = ''
      await this.connect()
      try {
        if (mergeType === 'DELETE') {
          await this.client.query(dropTableStatement)
        }
        await this.client.query(createTableStatement)
        for (let i = 0; i < values.length; i += batchSize) {
          const batchValues = values.slice(i, i + batchSize);
          insertStatement = pgFormat(
              `INSERT INTO ${tableName} (${columns
                .map(({ fieldName }) => `"${fieldName}"`)
                .join(',')}) VALUES %L`,
              batchValues
            )
          await this.client.query(insertStatement)
        }
      } catch (err) {
        throw {
          message: err instanceof Error ? err.message : 'An unknown error occurred',
          stats: {
            statements: [
              dropTableStatement,
              createTableStatement,
              insertStatement,
            ],
          },
        }
    }
  }

  async dropTable(name: string, options?: QueryOptions): Promise<void> {
    await this.client.connect()
    const statement = `DROP TABLE "${name}"`
    try {
      if (options?.catalog) {
        await this.client.query(`SET search_path TO ${options.catalog};`)
      }
      await this.client.query(statement)
    }catch(err: any) {
      throw {
        message: err.message,
        stats: {
          statements: [
            statement
          ],
        },
      }
    } finally {
      await this.client.end()
    }
  }

  /**
   * Ensure uuid-ossp extension exists if any column uses uuid_generate_v4()
   */
  private async ensureUuidExtension(columns: any[]): Promise<void> {
    // Check if any column uses uuid_generate_v4() as default value
    const needsUuidExtension = columns.some((col: any) => {
      const defaultValue = col.defaultValue?.toString().toLowerCase()
      return col.type === 'uuid' && defaultValue === 'uuid_generate_v4()'
    })

    if (needsUuidExtension) {
      // Check if extension already exists
      const extensionCheck = await this.runQuery(`
        SELECT * FROM pg_extension WHERE extname = 'uuid-ossp'
      `)
      
      if (!Array.isArray(extensionCheck.data) || extensionCheck.data.length === 0) {
        // Create extension if it doesn't exist
        await this.runQuery(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`)
      }
    }
  }

  async tableOp(
    action: DBTableAction,
    params: DBTableOperationParams,
  ): Promise<any> {
    switch(action) {
      case DBTableAction.CREATE_TABLE: {
        const { schema, table, columns, createMode = DBCreateTableMode.ERROR } = params
        const tableName = schema ? `"${schema}"."${table}"` : `"${table}"`

        // Ensure uuid-ossp extension exists if needed
        await this.ensureUuidExtension(columns)

        // Check if table exists
        const existsResult = await this.runQuery(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = '${schema || 'public'}'
            AND table_name = '${table}';
        `)

        const exists = Array.isArray(existsResult.data) && existsResult.data.length > 0

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
          // Ensure uuid-ossp extension exists if needed (for new columns)
          await this.ensureUuidExtension(columns)
          
          // Get current table structure
          const currentCols = await this.runQuery(`
            SELECT column_name, data_type, is_nullable 
            FROM information_schema.columns 
            WHERE table_schema='${schema || 'public'}' 
              AND table_name='${table}'
          `)

          // 1. Delete columns not in target list
          const targetColumnNames = columns.map(c => c.fieldName)
          for (const currentCol of currentCols.data) {
            const colName = (currentCol as any).column_name
            if (!targetColumnNames.includes(colName)) {
              await this.runQuery(`ALTER TABLE ${tableName} DROP COLUMN "${colName}"`)
            }
          }

          // 2. Compare columns, add/modify fields
          for (const col of columns) {
            const existing = currentCols.data.find((c: any) => c.column_name === col.fieldName)

            // New field → ADD COLUMN
            if (!existing) {
              const colAny = col as any
              const typeDDL = typeToPGDB(col.type, col.isKey, col.length, colAny.precision, colAny.scale || col.fraction, colAny.enumValues)
              const notNull = col.required ? ' NOT NULL' : ''
              const unique = !col.isKey && col.unique ? ' UNIQUE' : ''
              // Auto-increment fields should not have default values, empty string is treated as no default
              const defaultVal = !col.autoIncrement && col.defaultValue && col.defaultValue.trim() ? ` DEFAULT ${this.formatDefaultValue(col.defaultValue, col.type)}` : ''
              const autoInc = col.autoIncrement && (col.type === 'number' || col.type === 'bigint' || col.type === 'serial' || col.type === 'bigserial') ? ' GENERATED ALWAYS AS IDENTITY' : ''
              // Add CHECK constraint for ENUM type
              const enumCheck = col.type === 'enum' && colAny.enumValues && colAny.enumValues.length > 0 
                ? ` CHECK (${col.fieldName} IN (${colAny.enumValues.map(v => `'${String(v).replace(/'/g, "''")}'`).join(', ')}))`
                : ''
              
              // PostgreSQL column order: type PRIMARY KEY GENERATED ALWAYS AS IDENTITY NOT NULL UNIQUE DEFAULT CHECK
              await this.runQuery(`ALTER TABLE ${tableName} ADD COLUMN "${col.fieldName}" ${typeDDL}${autoInc}${notNull}${unique}${defaultVal}${enumCheck}`)
              continue
            }

            // Field exists, check if type needs to be updated
            const dbDataType = (existing as any).data_type
            const oldAppType = this.pgTypeToAppType(dbDataType)
            const newAppType = col.type
            const colAny = col as any
            const newType = typeToPGDB(col.type, col.isKey, col.length, colAny.precision, colAny.scale || col.fraction, colAny.enumValues)

            // Compare application-level types, modify if different
            if (oldAppType !== newAppType) {
              // Use USING clause to handle type conversion
              let usingClause = ''
              
              if (newAppType === 'number' || newAppType === 'bigint') {
                usingClause = ` USING CASE WHEN "${col.fieldName}" ~ '^[0-9]+$' THEN "${col.fieldName}"::${newType} ELSE NULL END`
              } else if (newAppType === 'string' || newAppType === 'text') {
                usingClause = ` USING "${col.fieldName}"::TEXT`
              } else if (newAppType === 'boolean') {
                usingClause = ` USING "${col.fieldName}"::BOOLEAN`
              } else if (newAppType === 'date') {
                usingClause = ` USING "${col.fieldName}"::DATE`
              } else if (newAppType === 'datetime' || newAppType === 'timestamp') {
                usingClause = ` USING "${col.fieldName}"::TIMESTAMP`
              } else {
                usingClause = ` USING "${col.fieldName}"::${newType}`
              }
              
              await this.runQuery(`ALTER TABLE ${tableName} ALTER COLUMN "${col.fieldName}" TYPE ${newType}${usingClause}`)
            }
          }

          return
        }

        // --- MODE: CREATE NEW TABLE ---
        const createTableStatement = `
          CREATE TABLE IF NOT EXISTS ${tableName} (
            ${columns
              .map((col) => {
                const colAny = col as any
                const typeDDL = typeToPGDB(col.type, col.isKey, col.length, colAny.precision, colAny.scale || col.fraction, colAny.enumValues)
                const pk = col.isKey ? ' PRIMARY KEY' : ''
                const notNull = col.required ? ' NOT NULL' : ''
                const unique = !col.isKey && col.unique ? ' UNIQUE' : ''  // Primary key is already unique, no need to add UNIQUE
                const autoInc = col.autoIncrement && (col.type === 'number' || col.type === 'bigint' || col.type === 'serial' || col.type === 'bigserial') ? ' GENERATED ALWAYS AS IDENTITY' : ''
                // Auto-increment fields should not have default values, empty string is treated as no default
                const defaultVal = !col.autoIncrement && col.defaultValue && col.defaultValue.trim() ? ` DEFAULT ${this.formatDefaultValue(col.defaultValue, col.type)}` : ''
                // Add CHECK constraint for ENUM type
                const enumCheck = col.type === 'enum' && colAny.enumValues && colAny.enumValues.length > 0 
                  ? ` CHECK (${col.fieldName} IN (${colAny.enumValues.map(v => `'${String(v).replace(/'/g, "''")}'`).join(', ')}))`
                  : ''
                // PostgreSQL column order: type PRIMARY KEY GENERATED ALWAYS AS IDENTITY NOT NULL UNIQUE DEFAULT CHECK
                return `"${col.fieldName}" ${typeDDL}${pk}${autoInc}${notNull}${unique}${defaultVal}${enumCheck}`
              })
              .join(', ')}
          )
        `

        await this.runQuery(createTableStatement)
        return
      }
      case DBTableAction.GET_TABLE_INFO: {
        const { schema, table } = params
        const tableName = schema ? `"${schema}"."${table}"` : `"${table}"`

        const result = await this.runQuery(`
          SELECT column_name, data_type, is_nullable 
          FROM information_schema.columns 
          WHERE table_schema='${schema || 'public'}' 
            AND table_name='${table}'
        `)

        return result.data.length === 0 ? null : {
          table: tableName,
          columns: result.data.map((col: any) => ({
            name: col.column_name,
            type: pgTypeMap(col.data_type),
            isNullable: col.is_nullable === 'YES',
          })),
        }
      }
      case DBTableAction.RENAME_TABLE: {
        // Rename table
        const { schema, table, newTable } = params
        const oldTableName = schema ? `"${schema}"."${table}"` : `"${table}"`
        
        await this.runQuery(`ALTER TABLE ${oldTableName} RENAME TO "${newTable}"`)
        return
      }
      case DBTableAction.DROP_TABLE: {
        // Drop table
        const { schema, table } = params
        const tableName = schema ? `"${schema}"."${table}"` : `"${table}"`
        
        await this.runQuery(`DROP TABLE IF EXISTS ${tableName}`)
        return
      }
      default:
        throw new Error(`Unsupported table action: ${action}`)
    }
  }

  async tableDataOp(
    action: DBTableDataAction,
    params: DBTableDataParams,
    options?: QueryOptions
  ) {
    const { schema, table, columns, values } = params
    const tableName = schema ? `"${schema}"."${table}"` : `"${table}"`

    switch (action) {
      case DBTableDataAction.INSERT: {
        if (!columns?.length) {
          throw new Error(`INSERT requires columns definition`)
        }
        if (!values) {
          throw new Error(`INSERT requires values`)
        }

        // Ensure values is an array
        const rows = Array.isArray(values) ? values : [values]

        // 1. DB columns list
        const dbColumns = columns.map(col => `"${col.fieldName}"`)

        // 2. Build placeholders
        let paramIndex = 1
        const placeholders = rows
          .map(row => {
            const rowPlaceholders = columns.map(() => `$${paramIndex++}`)
            return `(${rowPlaceholders.join(', ')})`
          })
          .join(', ')

        // 3. Build params list according to column order
        const paramsList: any[] = []
        for (const row of rows) {
          for (const col of columns) {
            let value = row[col.name]

            // Automatically recognize jsonb fields
            if (col.type === 'object') {
              value = value === undefined ? null : JSON.stringify(value)
            }

            paramsList.push(value ?? null)
          }
        }

        // 4. Build final SQL
        const sql = `
          INSERT INTO ${tableName} (${dbColumns.join(', ')})
          VALUES ${placeholders}
        `

        return this.runQuery(sql, { ...options, params: paramsList })
      }
    }
  }

  /**
   * Format default value for SQL
   */
  private formatDefaultValue(value: string, type: string): string {
    // Check if it's a database function (e.g., CURRENT_TIMESTAMP, uuid_generate_v4())
    const upperValue = value.toUpperCase()
    const lowerValue = value.toLowerCase()
    
    // PostgreSQL time type default value function mapping
    const timeFunctions = {
      'CURRENT_DATE': true,
      'CURRENT_TIME': true,
      'CURRENT_TIMESTAMP': true,
      'NOW()': true,
      'LOCALTIME': true,
      'LOCALTIMESTAMP': true
    }
    
    // UUID generation function
    if (lowerValue === 'uuid_generate_v4()') {
      return 'uuid_generate_v4()'  // Return function name directly without quotes
    }
    
    if (timeFunctions[upperValue]) {
      return upperValue  // Return function name directly without quotes
    }
    
    // Add quotes for string, date, and time types
    if (type === 'string' || type === 'text' || type === 'uuid' || type === 'varchar' ||
        type === 'date' || type === 'datetime' || type === 'timestamp' || type === 'time') {
      return `'${value.replace(/'/g, "''")}'`  // Escape single quotes
    }
    
    if (type === 'boolean' || type === 'bool') {
      return value.toLowerCase() === 'true' ? 'TRUE' : 'FALSE'
    }
    
    // Numeric types without quotes
    return value
  }

  /**
   * Map PostgreSQL database type back to application type
   */
  private pgTypeToAppType(dbType: string): string {
    const lowerType = dbType.toLowerCase()
    
    // Integer types
    if (lowerType === 'integer' || lowerType === 'int' || lowerType === 'int4' || lowerType === 'smallint') {
      return 'number'
    }
    if (lowerType === 'bigint' || lowerType === 'int8' || lowerType.includes('serial')) {
      return 'bigint'
    }
    // Decimal types
    if (lowerType.includes('decimal') || lowerType.includes('numeric')) {
      return 'decimal'
    }
    if (lowerType.includes('float') || lowerType.includes('double') || lowerType.includes('real')) {
      return 'float'
    }
    // String types
    if (lowerType.includes('varchar') || lowerType.includes('char') && !lowerType.includes('character varying')) {
      return 'string'
    }
    if (lowerType === 'text' || lowerType.includes('character varying')) {
      return lowerType === 'text' ? 'text' : 'string'
    }
    if (lowerType === 'uuid') {
      return 'uuid'
    }
    // Boolean types
    if (lowerType.includes('bool')) {
      return 'boolean'
    }
    // Time types
    if (lowerType === 'date') {
      return 'date'
    }
    if (lowerType === 'time' || lowerType.includes('time without')) {
      return 'time'
    }
    if (lowerType === 'timestamp' || lowerType.includes('timestamp without')) {
      return 'datetime'
    }
    if (lowerType.includes('timestamp') || lowerType.includes('timestamptz')) {
      return 'timestamp'
    }
    // JSON types
    if (lowerType.includes('json')) {
      return 'object'
    }
    
    return 'string'  // Default
  }

  async teardown() {
    await this.client.end()
  }
}

register(POSTGRES_TYPE, PostgresRunner)
