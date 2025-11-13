import { Client, ClientConfig, types } from 'pg'
import { BaseSQLQueryRunner, SQLAdapterOptions, register } from '../../base'
import { convertPGSchema, getPGSchemaQuery, pgTypeMap, typeToPGDB } from '../../helpers'
import { CreationTable, DBProtocolEnum, DBSyntaxEnum, QueryResult, IDSSchema, QueryOptions, IColumnDef } from '../../types'
import { pgFormat } from './pg-format'
import { DBCreateTableMode, DBTableAction, DBTableOperationParams } from '@xpert-ai/plugin-sdk'


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

  constructor(options: any) {
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
    const { catalog } = options ?? {}

    await this.connect()

    if (catalog) {
      query = `SET search_path TO ${catalog};` + query
    }
    let res = await this.client.query(query)

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
    
    // res.rows 存在 number 类型的结果是 string 的值 (sum(int8) 成了 string)
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
      .map((col) => `"${col.fieldName}" ${typeToPGDB(col.type, col.isKey, col.length)}${col.isKey ? ' PRIMARY KEY' : ''}`)
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

  async tableOp(
    action: DBTableAction,
    params: DBTableOperationParams,
  ): Promise<any> {
    switch(action) {
      case DBTableAction.CREATE_TABLE: {
        const { schema, table, columns, createMode = DBCreateTableMode.ERROR } = params
        const tableName = schema ? `"${schema}"."${table}"` : `"${table}"`

        // 1. 检查表是否存在
        const existsResult = await this.runQuery(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = '${schema || 'public'}'
            AND table_name = '${table}';
        `)

        const exists = Array.isArray(existsResult) && existsResult.length > 0

        // --- MODE: ERROR → 表存在时报错 ---
        if (exists && createMode === DBCreateTableMode.ERROR) {
          throw new Error(`Table "${tableName}" already exists`)
        }

        // --- MODE: IGNORE → 存在则不处理 ---
        if (exists && createMode === DBCreateTableMode.IGNORE) {
          return
        }

        // --- MODE: UPGRADE → 自动升级字段 ---
        if (exists && createMode === DBCreateTableMode.UPGRADE) {
          // 获取当前表结构
          const currentCols = await this.runQuery(`
            SELECT column_name, data_type, is_nullable 
            FROM information_schema.columns 
            WHERE table_schema='${schema || 'public'}' 
              AND table_name='${table}'
          `)

          // 对比字段，新增/修改字段
          for (const col of columns) {
            const existing = currentCols.columns.find(c => c.name === col.fieldName)

            // 新字段 → ADD COLUMN
            if (!existing) {
              await this.runQuery(`
                ALTER TABLE ${tableName} 
                ADD COLUMN "${col.fieldName}" ${typeToPGDB(col.type, col.isKey, col.length)}
              `)
              continue
            }

            // 字段存在，检查类型是否需要更新
            const newType = typeToPGDB(col.type, col.isKey, col.length)
            const oldType = existing.type

            if (newType.toLowerCase() !== oldType.toLowerCase()) {
              await this.runQuery(`
                ALTER TABLE ${tableName} 
                ALTER COLUMN "${col.fieldName}" TYPE ${newType}
              `)
            }
          }

          return
        }

        // --- MODE: CREATE NEW TABLE ---
        const createTableStatement = `
          CREATE TABLE IF NOT EXISTS ${tableName} (
            ${columns
              .map(
                (col) =>
                  `"${col.fieldName}" ${typeToPGDB(col.type, col.isKey, col.length)}${
                    col.isKey ? ' PRIMARY KEY' : ''
                  }`
              )
              .join(', ')}
          )
        `

        await this.runQuery(createTableStatement)
        return
      }
      default:
        throw new Error(`Unsupported table action: ${action}`)
    }
  }

  async teardown() {
    await this.client.end()
  }
}

register(POSTGRES_TYPE, PostgresRunner)
