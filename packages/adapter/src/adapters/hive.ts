import { DBProtocolEnum, DBSyntaxEnum, IColumnDef, IDSSchema, IDSTable, QueryOptions, QueryResult } from '../types'
import { auth, connections, HiveClient, HiveUtils, thrift } from 'hive-driver'
import { ColumnRequest, TablesRequest } from 'hive-driver/dist/contracts/IHiveSession'
import { BaseSQLQueryRunner, register, SQLAdapterOptions } from '../base'
import { groupBy } from '../helpers'

const { TCLIService, TCLIService_types } = thrift
const utils = new HiveUtils(TCLIService_types)

export interface HiveAdapterOptions extends SQLAdapterOptions {
  http_path?: string
}

export class HiveQueryRunner extends BaseSQLQueryRunner<HiveAdapterOptions> {
  readonly name = 'Hive'
  readonly type = 'hive'
  readonly syntax = DBSyntaxEnum.SQL
  readonly protocol = DBProtocolEnum.SQL

  readonly jdbcDriver = 'org.apache.hive.jdbc.HiveDriver'
  jdbcUrl(catalog?: string) {
    return `jdbc:hive2://${this.options.host}:${this.options.port}/${catalog};transportMode=http;ssl=true;httpPath=/hive2`
  }

  get configurationSchema() {
    return {
      type: 'object',
      properties: {
        host: { type: 'string' },
        port: { type: 'number' },
        database: { type: 'string' },
        username: { type: 'string' },
        password: { type: 'string', title: 'Password' },
        http_scheme: {
          type: 'string',
          title: 'HTTP Scheme (http or https)',
          default: 'https'
        },
        http_path: { type: 'string', title: 'HTTP Path' }
      },
      order: ['host', 'port', 'http_path', 'username', 'password', 'database', 'http_scheme'],
      secret: ['password'],
      required: ['host', 'http_path']
    }
  }

  async connectClient() {
    const hiveClient = new HiveClient(TCLIService, TCLIService_types)
    const options = {} as any

    if (this.options.http_path) {
      options.path = this.options.http_path
    }

    const authentication = this.options.username
      ? new auth.PlainTcpAuthentication({
          username: this.options.username as string,
          password: this.options.password as string
        })
      // ? new auth.PlainHttpAuthentication({
      //   username: this.options.username as string,
      //   password: this.options.password as string
      // })
      : new auth.NoSaslAuthentication()
    const client = await hiveClient.connect(
      {
        host: this.options.host as string,
        port: Number(this.options.port),
        options
      },
      new connections.TcpConnection(),
      authentication
    )

    return client
  }

  async openSession(client: HiveClient) {
    const session = await client.openSession({
      client_protocol: TCLIService_types.TProtocolVersion.HIVE_CLI_SERVICE_PROTOCOL_V10
    })
    return session
  }

  async closeSession(session, client) {
    await session.close()
    await client.close()
  }

  async runQuery(query: string, options?: QueryOptions) {
    const client = await this.connectClient()
    const session = await this.openSession(client)
    const selectDataOperation = await session.executeStatement(query, {
      runAsync: true
    })
    const stats = {} as any
    let error = null
    let status
    try {
      await utils.waitUntilReady(selectDataOperation, false, (stateResponse) => {
        // console.log(stateResponse.taskStatus)
        const taskStatus = JSON.parse(stateResponse.taskStatus)[0]
        if (taskStatus) {
          stats.beginTime = taskStatus.beginTime
          stats.endTime = taskStatus.endTime
          stats.taskId = taskStatus.taskId
          stats.taskState = taskStatus.taskState
          stats.taskType = taskStatus.taskType
          stats.name = taskStatus.name
          stats.elapsedTime = taskStatus.elapsedTime
        }

        if (taskStatus?.returnValue === 1) {
          status = 'ERROR'
          error = taskStatus.errorMsg
        } else {
          status = 'OK'
        }
      })
    } catch (err: any) {
      console.error(err)
      status = 'ERROR'
      error = err.response?.errorMessage
    }

    await utils.fetchAll(selectDataOperation)
    await selectDataOperation.close()

    const schema = selectDataOperation.getSchema()
    // const data = selectDataOperation.getData()
    const result = utils.getResult(selectDataOperation).getValue()

    await this.closeSession(session, client)

    if (status === 'ERROR') {
      return {
        status,
        error
      } as QueryResult
    }

    return {
      status,
      data: result,
      columns: schema?.columns?.map((column) => {
        const columnNames = column.columnName.split('.')
        return {
          name: columnNames[1] ?? columnNames[0],
          label: column.comment,
          position: column.position,
          type: typeMap(column.typeDesc.types[0].primitiveEntry.type)
        } as IColumnDef
      }),
      stats
    } as QueryResult
  }

  async getCatalogs(): Promise<IDSSchema[]> {
    const client = await this.connectClient()
    const session = await this.openSession(client)

    const selectDataOperation = await session.getSchemas({})
    await utils.waitUntilReady(selectDataOperation, false, () => {
      //
    })
    await utils.fetchAll(selectDataOperation)
    await selectDataOperation.close()

    const schemas = utils.getResult(selectDataOperation).getValue()

    await this.closeSession(session, client)

    return schemas.map((item) => ({
      catalog: item.TABLE_CATALOG,
      schema: item.TABLE_SCHEM,
      name: item.TABLE_SCHEM,
      label: item.REMARKS
    }))
  }

  async getSchema(schemaName?: string, tableName?: string): Promise<IDSSchema[]> {
    const client = await this.connectClient()
    const session = await this.openSession(client)
    const params: TablesRequest = { schemaName: schemaName }
    if (tableName) {
      // Backward compatibility
      if (tableName.startsWith(schemaName + '.')) {
        tableName = tableName.replace(schemaName + '.', '')
      }
      params.tableName = tableName
    }
    const selectDataOperation = await session.getTables(params)
    await utils.waitUntilReady(selectDataOperation, false, () => {
      //
    })
    await utils.fetchAll(selectDataOperation)
    await selectDataOperation.close()

    const tables = utils.getResult(selectDataOperation).getValue()

    const columnRequest: ColumnRequest = { ...params }
    const selectColumnsOperation = await session.getColumns(columnRequest)
    await utils.waitUntilReady(selectColumnsOperation, false, () => {
      //
    })
    await utils.fetchAll(selectColumnsOperation)
    await selectColumnsOperation.close()
    const columns = utils.getResult(selectColumnsOperation).getValue()

    const schemas = groupBy(tables, 'TABLE_SCHEM')

    return Object.keys(schemas).map((schemaName) => {
      return {
        schema: schemaName,
        name: schemaName,
        tables: schemas[schemaName].map((item) => {
          return {
            schema: item.TABLE_SCHEM,
            name: item.TABLE_NAME, // item.TABLE_SCHEM === 'default' ? item.TABLE_NAME : `${item.TABLE_SCHEM}.${item.TABLE_NAME}`,
            label: item.REMARKS,
            columns: columns
              .filter((col) => col.TABLE_SCHEM === item.TABLE_SCHEM && col.TABLE_NAME === item.TABLE_NAME)
              .map((col) => ({
                name: col.COLUMN_NAME,
                dataType: col.TYPE_NAME.toLowerCase(),
                type: typeMap(col.TYPE_NAME.toLowerCase()),
                label: col.REMARKS,
                nullable: col.NULLABLE === 1
              }))
          } as IDSTable
        })
      }
    })
  }

  async describe(catalog: string, statement: string) {
    if (!statement) {
      return { columns: [] }
    }

    statement = `${statement} LIMIT 1`
    return this.runQuery(statement, { catalog })
  }

  /**
   * @todo Implement
   * @param catalog 
   * @param options 
   */
  override async createCatalog(catalog: string, options?: {}) {
    throw new Error('Method not implemented.')
  }

  async teardown() {
    return null
  }
}

function typeMap(type: string | number): string {
  switch (type) {
    case 'int':
    case 'bigint':
    case 'float':
    case TCLIService_types.TTypeId.BIGINT_TYPE:
    case TCLIService_types.TTypeId.FLOAT_TYPE:
    case TCLIService_types.TTypeId.DOUBLE_TYPE:
    case TCLIService_types.TTypeId.INT_TYPE:
    case TCLIService_types.TTypeId.SMALLINT_TYPE:
    case TCLIService_types.TTypeId.TINYINT_TYPE:
    case TCLIService_types.TTypeId.DECIMAL_TYPE:
      return 'number'
    case 'uuid':
    case 'varchar':
    case 'character varying':
    case TCLIService_types.TTypeId.STRING_TYPE:
    case TCLIService_types.TTypeId.CHAR_TYPE:
    case TCLIService_types.TTypeId.VARCHAR_TYPE:
      return 'string'
    case 'timestamp without time zone':
    case TCLIService_types.TTypeId.TIMESTAMP_TYPE:
    case TCLIService_types.TTypeId.DATE_TYPE:
      return 'timestamp'
    case 'json':
      return 'object'
    default:
      return `${type}`
  }
}

register('hive', HiveQueryRunner)
