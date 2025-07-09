import { register } from '../../base'
import { DBProtocolEnum, DBSyntaxEnum } from '../../types'
import { PostgresAdapterOptions, PostgresRunner } from '../postgres'

export const OPENGAUSS_TYPE = 'opengauss'

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface OpenGaussAdapterOptions extends PostgresAdapterOptions {
  // You can add opengauss-specific configuration items as needed
}

export class OpenGaussRunner extends PostgresRunner {
  readonly name = 'OpenGauss'
  readonly type = OPENGAUSS_TYPE
  readonly protocol = DBProtocolEnum.SQL
  readonly syntax = DBSyntaxEnum.SQL
  readonly jdbcDriver = 'org.opengauss.Driver'

  constructor(options: OpenGaussAdapterOptions) {
    // If OpenGauss does not pass the database, it can be set to 'gaussdb' by default
    if (!options.database) {
      options.database = 'gaussdb'
    }
    super(options)
  }

  override jdbcUrl(schema?: string): string {
    return `jdbc:opengauss://${this.host}:${this.port}/${this.options.database}?` +
      (schema ? `currentSchema=${schema}&` : '') +
      `user=${encodeURIComponent(this.options.username)}&password=${encodeURIComponent(this.options.password)}`
  }

  override get configurationSchema() {
    const schema = super.configurationSchema
    schema.properties.database.default = 'gaussdb'
    return schema
  }
}

register(OPENGAUSS_TYPE, OpenGaussRunner)
