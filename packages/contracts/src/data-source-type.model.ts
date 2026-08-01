import { IBasePerTenantEntityModel } from './base-entity.model'

export interface IDataSourceType extends IBasePerTenantEntityModel {
  name?: string
  type?: string
  syntax?: DataSourceSyntaxEnum
  protocol?: DataSourceProtocolEnum
  configuration?: Record<string, unknown>
}

export enum DataSourceSyntaxEnum {
  SQL = 'sql',
  MDX = 'mdx'
}

export enum DataSourceProtocolEnum {
  SQL = 'sql',
  XMLA = 'xmla'
}
