import odbc from 'odbc'
import { BaseSQLQueryRunner, register, SQLAdapterOptions } from '../../base'
import { IColumnDef, IDSSchema, QueryOptions, QueryResult } from '../../types'

export const DAMENG_TYPE = 'dm'

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface DamengAdapterOptions extends SQLAdapterOptions {
  database?: string
  dsn?: string
}

export class DamengRunner extends BaseSQLQueryRunner<DamengAdapterOptions> {
  readonly name = '达梦数据库'
  readonly type = DAMENG_TYPE
  readonly jdbcDriver = 'dm.jdbc.driver.DmDriver'

  override jdbcUrl(schema?: string): string {
    return (
      `jdbc:dm://${this.host}:${this.port}/${this.options.catalog}` +
      `?user=${encodeURIComponent(this.options.username)}&password=${encodeURIComponent(this.options.password)}`
    )
  }

  get configurationSchema() {
    return {
      type: 'object',
      properties: {
        host: { type: 'string', title: 'Host' },
        port: { type: 'number', title: 'Port', default: 5236 },
        username: { type: 'string', title: 'Username' },
        password: { type: 'string', title: 'Password' },

        // 在达梦中 catalog 可表示 database/schema 名称
        catalog: { type: 'string', title: 'Database/Schema', default: 'SYSDBA' },

        timezone: { type: 'string', title: 'Timezone', default: '+08:00' },
        serverTimezone: { type: 'string', title: 'Server Timezone', default: 'Asia/Shanghai' },

        // SSL 暂不常用于达梦，但保留可选项
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
          title: 'Query timeout (seconds)'
        }
      },
      order: ['host', 'port', 'username', 'password', 'catalog'],
      required: ['host', 'port', 'username', 'password'],
      secret: ['password', 'ssl_cacert', 'ssl_cert', 'ssl_key']
    }
  }

  private connection: odbc.Connection | null = null

  async getConnection(): Promise<odbc.Connection> {
    if (this.connection) return this.connection

    const connStr = this.options.dsn
      ? `DSN=${this.options.dsn}`
      : `DRIVER=DM8 ODBC DRIVER;SERVER=${this.options.host};UID=${this.options.username};PWD=${this.options.password};PORT=${this.options.port};DATABASE=${this.options.database}`

    this.connection = await odbc.connect(connStr)
    return this.connection
  }

  async runQuery(query: string, options?: QueryOptions): Promise<QueryResult> {
    try {
      const conn = await this.getConnection()
      const result = await conn.query(query)

      // 转换列信息（列名 + 类型）
      const columns: IColumnDef[] =
        result.columns?.map((col: any) => ({
          name: col.name || col.column || col.ColumnName || '', // 兼容多种字段名
          type: col.dataType || col.type || 'string',
          dataType: col.dataType || col.type || 'string'
        })) || this.inferColumns(result)

      // 转换数据
      const data: any[] = Array.isArray(result) ? result : result || []

      return {
        status: 'OK',
        data,
        columns,
        stats: {
          rowCount: data.length
        }
      }
    } catch (err: any) {
      return {
        status: 'ERROR',
        error: err.message || String(err)
      }
    }
  }

  async createCatalog(catalog: string): Promise<void> {
    const sql = `CREATE SCHEMA ${catalog}`
    await this.runQuery(sql)
  }

  async getCatalogs(): Promise<IDSSchema[]> {
    const result = await this.runQuery(`SELECT SCHEMA_NAME as name FROM DBA_SCHEMAS`)
    return result as unknown as IDSSchema[]
  }

  async getSchema(catalog?: string, tableName?: string): Promise<IDSSchema[]> {
    const whereClause = []
    if (catalog) {
      whereClause.push(`TABLE_SCHEMA = '${catalog}'`)
    }
    if (tableName) {
      whereClause.push(`TABLE_NAME = '${tableName}'`)
    }
    const where = whereClause.length ? `WHERE ${whereClause.join(' AND ')}` : ''

    const sql = `
      SELECT 
        TABLE_NAME as table, 
        COLUMN_NAME as column, 
        DATA_TYPE as type 
      FROM 
        ALL_TAB_COLUMNS
      ${where}
    `
    const results = await this.runQuery(sql)
    return results as unknown as IDSSchema[]
  }

  async teardown(): Promise<void> {
    if (this.connection) {
      await this.connection.close()
      this.connection = null
    }
  }

  private inferColumns(rows: any[]): IColumnDef[] {
    if (!Array.isArray(rows) || rows.length === 0) return []
    const sample = rows[0]
    return Object.keys(sample).map((key) => ({
      name: key,
      type: typeof sample[key] === 'number' ? 'number' : 'string',
      dataType: typeof sample[key] === 'number' ? 'number' : 'string'
    }))
  }
}

register(DAMENG_TYPE, DamengRunner)
