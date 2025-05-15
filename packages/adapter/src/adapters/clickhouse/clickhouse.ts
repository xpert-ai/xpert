import { ClickHouse } from 'clickhouse'
import { BaseSQLQueryRunner, register, SQLAdapterOptions } from '../../base'
import { groupBy, typeOfObj } from '../../helpers'
import { CreationTable, DBProtocolEnum, DBSyntaxEnum, IDSSchema } from '../../types'
import { typeToCHDB } from './types'

export interface ClickHouseAdapterOptions extends SQLAdapterOptions {
  dbname?: string
}

export class ClickHouseRunner extends BaseSQLQueryRunner<ClickHouseAdapterOptions> {
  readonly name = 'ClickHouse'
  readonly type = 'clickhouse'
  readonly syntax = DBSyntaxEnum.SQL
  readonly protocol = DBProtocolEnum.SQL

  readonly jdbcDriver = 'ru.yandex.clickhouse.ClickHouseDriver'

  jdbcUrl(schema?: string) {
    return `jdbc:clickhouse://${this.host}:${this.port}/${this.options.dbname}`
  }

  get configurationSchema() {
    return {
      type: 'object',
      properties: {
        url: { type: 'string', default: 'http://127.0.0.1:8123' },
        host: { type: 'string', default: 'localhost' },
        port: { type: 'number', default: 8123 },
        username: { type: 'string', default: 'default' },
        password: { type: 'string' },
        dbname: { type: 'string', title: 'Database Name' },
        timeout: {
          type: 'number',
          title: 'Request Timeout',
          default: 30,
        },
        verify: {
          type: 'boolean',
          title: 'Verify SSL certificate',
          default: true,
        },
      },
      order: ['url', 'username', 'password', 'dbname'],
      required: ['dbname'],
      extra_options: ['timeout', 'verify'],
      secret: ['password'],
    }
  }

  getClient() {
    const url = this.options.url || 'http://127.0.0.1:8123'
    const basicAuth = this.options.username
      ? {
          username: this.options.username,
          password: this.options.password,
        }
      : null
    return new ClickHouse({
      url,
      debug: false,
      basicAuth,
      isUseGzip: false,
      format: 'json', // "json" || "csv" || "tsv"
      raw: false,
      config: {
        // session_id: 'session_id if neeed',
        // session_timeout: 60,
        output_format_json_quote_64bit_integers: 0,
        enable_http_compression: 0,
        database: this.options.dbname,
      },
    })
  }

  async runQuery(query: string, options?: any) {
    const clickhouse = this.getClient()

    return clickhouse
      .query(query)
      .toPromise()
      .then((rows) => {
        let columns = []
        if (rows[0]) {
          columns = typeOfObj(rows[0])
        }
        return { data: rows, columns }
      }) as any
  }

  async getCatalogs(): Promise<IDSSchema[]> {
    const query =
      "SELECT name, engine FROM system.databases WHERE (name NOT IN ('system')) AND (engine NOT IN ('Memory'))"
    return this.runQuery(query).then(({ data }) =>
      data.map((row: any) => ({
        schema: row.name,
        name: row.name,
        type: row.engine,
      }))
    )
  }

  async getSchema(catalog?: string, tableName?: string): Promise<IDSSchema[]> {
    let query = catalog
      ? `SELECT database, table, name, type FROM system.columns WHERE database == '${catalog}'`
      : `SELECT database, table, name, type FROM system.columns WHERE database NOT IN ('system')`
    if (tableName) {
      query += ` AND table == '${tableName}'`
    }
    return this.runQuery(query).then(({ data }) => {
      const databases = groupBy(data, 'database')
      const schemas = []
      Object.entries(databases).forEach(([database, value]: any) => {
        const tableGroup = groupBy(value, 'table')
        const tables = Object.entries(tableGroup).map(([table, columns]: [string, any]) => {
          return {
            schema: database,
            name: table,
            columns: columns.map((item: any) => ({
              name: item.name,
              dataType: item.type,
              type: typeMap(item.type),
            })),
          }
        })

        schemas.push({
          schema: database,
          name: database,
          tables
        })
      })

      return schemas
    })
  }

  async describe(catalog: string, statement: string) {
    if (!statement) {
      return { columns: [] }
    }

    statement = `${statement} LIMIT 1`
    return this.runQuery(statement, { catalog })
  }

  override async createCatalog(catalog: string, options?: {}) {
    await this.runQuery(`CREATE DATABASE IF NOT EXISTS ${catalog}`)
  }

  async import(params: CreationTable, options?: { catalog?: string }): Promise<void> {
    const { name, columns, data, mergeType } = params;

    if (!data?.length) {
      throw new Error('data is empty');
    }

    const tableName = options?.catalog ? `${options.catalog}.${name}` : name;

    const dropTableStatement = `DROP TABLE IF EXISTS ${tableName}`;
    const createTableStatement = `CREATE TABLE IF NOT EXISTS ${tableName} (${columns.map(
      (col) => `\`${col.fieldName}\` ${typeToCHDB(col.type, col.isKey, col.length)}`
    ).join(', ')}) ENGINE = MergeTree() ORDER BY tuple()`;

    // Transform values
    const values = data.map((row, index) =>
      columns.map(({ name, type, length }) => {
        const value = row[name];
        if (value instanceof Date) {
          if (type === 'Date') return value.toISOString().slice(0, 10);
          if (type === 'Datetime') return value.toISOString().replace('T', ' ').slice(0, 19);
          if (type === 'Time') return value.toISOString().slice(11, 19);
          return value.toISOString();
        }
        if (type === 'Date' || type === 'Datetime') {
          try {
            const dateVal = new Date(value);
            return type === 'Datetime'
              ? dateVal.toISOString().replace('T', ' ').slice(0, 19)
              : dateVal.toISOString().slice(0, 10);
          } catch (err) {
            throw new Error(`Converting value '${value}' in row ${index} column '${name}' to date failed: ${(<Error>err).message}`);
          }
        }
        return value;
      })
    );

    const batchSize = 10000;
    const clickhouse = this.getClient()
    try {
      if (mergeType === 'DELETE') {
        await this.runQuery(dropTableStatement)
      }

      await this.runQuery(createTableStatement)

      for (let i = 0; i < values.length; i += batchSize) {
        const batch = values.slice(i, i + batchSize);
        await clickhouse.insert(`INSERT INTO ${tableName}`, batch).toPromise();
      }

    } catch (err) {
      throw {
        message: err instanceof Error ? err.message : 'An unknown error occurred',
        stats: {
          statements: [
            dropTableStatement,
            createTableStatement
          ],
        },
      };
    }
  }

  async teardown() {
    //
  }
}

function typeMap(type) {
  switch (type) {
    case 'Int32':
    case 'Float64':
      return 'number'
    default:
      return 'string'
  }
}

register('clickhouse', ClickHouseRunner)
