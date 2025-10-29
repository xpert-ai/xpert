import { MySQLRunner } from '@metad/adapter'
import { Injectable } from '@nestjs/common'
import { AdapterDataSourceStrategy, DataSourceStrategy } from '@xpert-ai/plugin-sdk'
import { MySQLDataSource } from './types'

@Injectable()
@DataSourceStrategy(MySQLDataSource)
export class MySQLDataSourceStrategy extends AdapterDataSourceStrategy {
  override type: string
  override name: string
  constructor() {
    super(MySQLRunner, [])
    this.type = MySQLDataSource
    this.name = 'MySQL Data Source'
  }
}
