import { IBasePerTenantAndOrganizationEntityModel, IBasePerTenantEntityModel } from '../base-entity.model'
import { IUser } from '../user.model'
import { IDataSourceType } from './data-source-type'
import { ISemanticModel } from './semantic-model'

export interface IDataSource extends IBasePerTenantAndOrganizationEntityModel {
  name?: string
  typeId?: string
  type?: IDataSourceType
  useLocalAgent?: boolean
  authType?: AuthenticationEnum

  options?: Record<string, unknown>

  models?: ISemanticModel[]
  authentications?: IDataSourceAuthentication[]
}

export interface IDataSourceAuthentication extends IBasePerTenantEntityModel {
  dataSourceId: string
  userId: string
  username: string
  password: string
  validUntil?: Date

  dataSource?: IDataSource
  user?: IUser
}

export enum AuthenticationEnum {
  NONE = 'NONE',
  BASIC = 'BASIC'
}

export enum DataSourceTypeEnum {
  NONE = 'NONE',
}

export interface IDSSchema {
  catalog?: string
  schema?: string
  name: string
  label?: string
  type?: string
  tables?: Array<IDSTable>
}

export interface IDSTable {
  schema?: string
  name?: string
  label?: string
  columns?: Array<IColumnDef>
}

export interface IColumnDef {
  name: string
  label?: string
  /**
   * Types in javascript
   */
  type: 'number' | 'string' | 'boolean' | 'object' | 'timestamp'
  /**
   * Original data type in database
   */
  dataType: string
  nullable?: boolean
  position?: number
  /**
   * 应该等同于 label
   */
  comment?: string
}
