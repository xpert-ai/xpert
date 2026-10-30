import { IUser } from './user.model'
import { IBasePerTenantEntityModel } from './base-entity.model'
import { IRolePermission } from './role-permission.model'

export interface IRole extends IRoleCreateInput {
  isSystem?: boolean
  rolePermissions?: IRolePermission[]
  users?: IUser[]
}

export interface IRoleCreateInput extends IBasePerTenantEntityModel {
  name: string
}

/**
 * Built-in permission presets. Effective access still requires enabled permissions
 * and resource authorization; role names alone do not grant access.
 */
export enum RolesEnum {
  /** Platform administration, including management of other administrators. */
  SUPER_ADMIN = 'SUPER_ADMIN',
  /** Tenant/organization administration, including members, billing and AI resources. */
  ADMIN = 'ADMIN',
  /** AI authoring: configure models, build Assistants and install applications. */
  AI_BUILDER = 'AI_BUILDER',
  /** Consume authorized chat and read permitted resources without authoring privileges. */
  VIEWER = 'VIEWER',
  /**
   * Managed application consumer: use assigned apps, published Assistants and projects.
   * No model-provider configuration, Assistant authoring or installation by default.
   */
  APP_USER = 'APP_USER',
  /**
   * Non-interactive service identity for application initialization and upgrades.
   * Uses scoped installation/authoring permissions and normal resource authorization.
   */
  APPLICATION_PROVISIONER = 'APPLICATION_PROVISIONER',
  /** Platform trial with authoring privileges; membership entitlements define trial limits. */
  TRIAL = 'TRIAL'
}

export const DEFAULT_SYSTEM_ROLES: RolesEnum[] = [
  RolesEnum.SUPER_ADMIN,
  RolesEnum.ADMIN,
  RolesEnum.TRIAL,
  RolesEnum.AI_BUILDER,
  RolesEnum.VIEWER,
  RolesEnum.APP_USER,
  RolesEnum.APPLICATION_PROVISIONER
]

export interface IRoleMigrateInput extends IBasePerTenantEntityModel {
  name: string
  isImporting: boolean
  sourceId: string
}
