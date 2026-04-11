import { register } from '../base'
import { DBProtocolEnum, DBSyntaxEnum } from '../types'
import { PrestoQueryRunner } from './presto'


export class TrinoQueryRunner extends PrestoQueryRunner {
  name = 'Trino'
  type = 'trino'
  readonly syntax = DBSyntaxEnum.SQL
  readonly protocol = DBProtocolEnum.SQL

  readonly jdbcDriver = 'io.trino.jdbc.TrinoDriver'
  jdbcUrl(schema?: string) {
    // jdbc:trino://host:port/catalog/schema
    const url = `jdbc:trino://${this.host}:${this.port}/${this.options.catalog}/${schema}?`
    const properties = []
    if (this.options.username) {
      properties.push(`user=${encodeURIComponent(this.options.username as string)}`)
    }
    if (this.options.password) {
      properties.push(`password=${encodeURIComponent(this.options.password as string)}`)
    }
    if (this.options.useSSL) {
      properties.push('SSL=true')
    }

    return url + properties.join('&')
  }
}

register('trino', TrinoQueryRunner)
