import { Injectable } from '@nestjs/common'
import { AdapterDataSourceStrategy, DataSourceStrategy } from '@xpert-ai/plugin-sdk'
import { MySQLRunner } from './mysql'

export const RDS_MYSQL_TYPE = 'rds_mysql'

@Injectable()
@DataSourceStrategy(RDS_MYSQL_TYPE)
export class RDSMySQLDataSourceStrategy extends AdapterDataSourceStrategy {
  override type: string
  override name: string
  constructor() {
    super(RDSMySQLRunner, [])
    this.type = RDS_MYSQL_TYPE
    this.name = 'RDS MySQL Data Source'
  }
}

export class RDSMySQLRunner extends MySQLRunner {
  override readonly name: string = 'MySQL (Amazon RDS)'
  override readonly type: string = RDS_MYSQL_TYPE
}