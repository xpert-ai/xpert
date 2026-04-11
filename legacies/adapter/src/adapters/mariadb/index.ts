import { register } from "../../base"
import { MySQLRunner } from "../mysql"

export const MARIADB_TYPE = 'mariadb'

export class MariaDBRunner extends MySQLRunner {
  readonly name = 'MariaDB'
  readonly type = MARIADB_TYPE
  readonly jdbcDriver = 'org.mariadb.jdbc.Driver'

  override jdbcUrl(schema?: string): string {
    return `jdbc:mariadb://${this.host}:${this.port}/${this.options.catalog}?` +
      (schema ? `currentSchema=${schema}&` : '') +
      `user=${encodeURIComponent(this.options.username)}&password=${encodeURIComponent(this.options.password)}`
  }
}

register(MARIADB_TYPE, MariaDBRunner)