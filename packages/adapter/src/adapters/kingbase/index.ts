import { register } from '../../base'
import { DBProtocolEnum, DBSyntaxEnum } from '../../types'
import { PostgresAdapterOptions, PostgresRunner } from '../postgres'

export const KINGBASE_TYPE = 'kingbase'

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface KingbaseAdapterOptions extends PostgresAdapterOptions {
}

export class KingbaseRunner extends PostgresRunner {
  readonly name = 'KingbaseES'
  readonly type = KINGBASE_TYPE
  readonly protocol = DBProtocolEnum.SQL
  readonly syntax = DBSyntaxEnum.SQL
  readonly jdbcDriver = 'com.kingbase8.Driver'

  constructor(options: KingbaseAdapterOptions) {
    // Set the default database name to kingbase (if not passed)
    if (!options.database) {
      options.database = 'kingbase'
    }
    super(options)
  }

  override jdbcUrl(schema?: string): string {
    return `jdbc:kingbase8://${this.host}:${this.port}/${this.options.database}?` +
      (schema ? `currentSchema=${schema}&` : '') +
      `user=${encodeURIComponent(this.options.username)}&password=${encodeURIComponent(this.options.password)}`
  }

  override get configurationSchema() {
    const schema = super.configurationSchema
    schema.properties.database.default = 'kingbase'
    return schema
  }
}

register(KINGBASE_TYPE, KingbaseRunner)