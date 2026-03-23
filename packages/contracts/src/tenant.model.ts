import { IImportRecord } from './import-export.model'
import { IFeatureOrganization } from './feature.model'
import { S3FileStorageProviderConfig } from './file-provider'
import { IOrganization, IOrganizationCreateInput } from './organization.model'
import { IRolePermission } from './role-permission.model'
import { IUserCreateInput } from './user.model'

export interface ITenant {
  id?: string
  name?: string

  readonly createdAt?: Date
  readonly updatedAt?: Date

  organizations?: IOrganization[]
  rolePermissions?: IRolePermission[]
  featureOrganizations?: IFeatureOrganization[]
  importRecords?: IImportRecord[]
  settings?: ISetting[]
}

export interface ITenantCreateInput {
  name: string

  isImporting?: boolean
  sourceId?: string
  userSourceId?: string

  superAdmin?: IUserCreateInput
  defaultOrganization?: IOrganizationCreateInput
}

export interface ISetting {
  name: string
  value: string
}

export interface ITenantSetting extends S3FileStorageProviderConfig {
  fileStorageProvider?: string
  tenant_title?: string
  tenant_title_en?: string
  tenant_enable_feishu?: boolean
  tenant_enable_dingtalk?: boolean
  tenant_enable_wechat?: boolean
  tenant_enable_github?: boolean
  tenant_enable_google?: boolean
}

export const DEFAULT_TENANT = 'Default Tenant'
