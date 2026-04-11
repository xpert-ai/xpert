import {
  RedshiftDataClient,
  BatchExecuteStatementCommand,
  BatchExecuteStatementCommandInput,
  BatchExecuteStatementCommandOutput,
  GetStatementResultCommand
} from '@aws-sdk/client-redshift-data'
import { BaseSQLQueryRunner, SQLAdapterOptions, register } from '../../base'
import { randomUUID } from 'crypto'
import { IColumnDef, IDSSchema, QueryResult, QueryOptions } from '../../types'
import { convertPGSchema, getPGSchemaQuery } from '../../helpers'

const REDSHIFT_TYPE = 'redshift'

export interface RedshiftAdapterOptions extends SQLAdapterOptions {
  region?: string
  clusterIdentifier?: string
  database?: string
  secretArn?: string
}

export class RedshiftRunner extends BaseSQLQueryRunner<RedshiftAdapterOptions> {
  readonly name: string = 'AWS Redshift'
  readonly type: string = REDSHIFT_TYPE

  private redshiftDataClient: RedshiftDataClient

  constructor(options: RedshiftAdapterOptions) {
    super(options)
    this.redshiftDataClient = new RedshiftDataClient({
      region: options.region
    })
  }

  get configurationSchema() {
    return {
      type: 'object',
      properties: {
        host: { type: 'string', default: '127.0.0.1' },
        port: { type: 'number', default: 5432 },
        username: { type: 'string', default: '' },
        password: { type: 'string' },
        database: { type: 'string', title: 'Database Name' },
        region: { type: 'string', title: 'Region' },
        clusterIdentifier: { type: 'string', title: 'Cluster Identifier' },
        secretArn: { type: 'string', title: 'SecretArn' },
        sslmode: {
          type: 'string',
          title: 'SSL Mode',
          default: 'prefer',
          extendedEnum: [
            { value: 'disable', name: 'Disable' },
            { value: 'allow', name: 'Allow' },
            { value: 'prefer', name: 'Prefer' },
            { value: 'require', name: 'Require' },
            { value: 'verify-ca', name: 'Verify CA' },
            { value: 'verify-full', name: 'Verify Full' }
          ]
        },
        sslrootcertFile: { type: 'textarea', title: 'SSL Root Certificate' },
        sslcertFile: { type: 'textarea', title: 'SSL Client Certificate' },
        sslkeyFile: { type: 'textarea', title: 'SSL Client Key' }
      },
      order: ['username', 'password', 'database'],
      required: ['region'],
      secret: ['password', 'sslrootcertFile', 'sslcertFile', 'sslkeyFile'],
      extra_options: ['sslmode', 'sslrootcertFile', 'sslcertFile', 'sslkeyFile']
    }
  }

  public jdbcUrl(schema?: string): string {
    // Implement the jdbcUrl method here
    return ''
  }

  public async runQuery(query: string, options?: QueryOptions): Promise<QueryResult> {
    const params: BatchExecuteStatementCommandInput = {
      ClusterIdentifier: this.options.clusterIdentifier,
      Database: this.options.database, // Assuming syntax is the database name
      SecretArn: this.options.secretArn,
      DbUser: this.options.username,
      ClientToken: randomUUID(),
      Sqls: [query]
    }

    const command = new BatchExecuteStatementCommand(params)

    // async/await.
    try {
      const out = await this.redshiftDataClient.send<
        BatchExecuteStatementCommandInput,
        BatchExecuteStatementCommandOutput
      >(command)
      const data = await this.redshiftDataClient.send(
        new GetStatementResultCommand({
          Id: out.Id
        })
      )
      // process data.
      return {
        status: 'OK',
        data: data.Records.map((record) => record.map((field) => field.stringValue)), // todo
        columns: data.ColumnMetadata as unknown as IColumnDef[]
      }
    } catch (error) {
      // error handling.
      console.log(error)
      throw error
    } finally {
      // finally.
    }
  }

  async getCatalogs(): Promise<IDSSchema[]> {
    const query =
      "SELECT nspname as name FROM pg_namespace WHERE nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast', 'pg_toast_temp_1', 'pg_temp_1')"
    return this.runQuery(query).then(({ data }) =>
      data.map((row: any) => ({
        name: row.name
      }))
    )
  }

  async getSchema(catalog?: string, tableName?: string): Promise<IDSSchema[]> {
    return this.runQuery(getPGSchemaQuery(catalog, tableName)).then(({ data }) => {
      return convertPGSchema(data)
    })
  }

  async describe(catalog: string, statement: string) {
    if (!statement) {
      return { columns: [] }
    }

    if (catalog) {
      statement = `SET search_path TO ${catalog};${statement} LIMIT 1`
    }
    return this.runQuery(statement)
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
    await this.redshiftDataClient.destroy()
  }
}

register(REDSHIFT_TYPE, RedshiftRunner)
