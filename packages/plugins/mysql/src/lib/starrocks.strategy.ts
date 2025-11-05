import { Injectable } from '@nestjs/common'
import { AdapterDataSourceStrategy, CreationTable, DataSourceStrategy } from '@xpert-ai/plugin-sdk'
import { DorisRunner, typeToDorisDB } from './doris.strategy'

const STARROCKS_TYPE = 'starrocks'

@Injectable()
@DataSourceStrategy(STARROCKS_TYPE)
export class StarRocksDataSourceStrategy extends AdapterDataSourceStrategy {
  override type: string
  override name: string
  constructor() {
    super(StarRocksRunner, [])
    this.type = STARROCKS_TYPE
    this.name = 'StarRocks Data Source'
  }
}


class StarRocksRunner extends DorisRunner {
  override readonly name: string = 'StarRocks'
  override readonly type: string = STARROCKS_TYPE

  /**
   * Import data into db
   * * Create table if not exist
   *
   * @param params
   * @returns
   */
  override async import(params: CreationTable, options?: { catalog?: string }): Promise<void> {
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
          .map((col) => `\`${col.fieldName}\` ${typeToDorisDB(col.type, col.length)}`)
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
