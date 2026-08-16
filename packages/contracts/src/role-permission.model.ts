import { AIPermissionsEnum } from './ai/index'
import { IBasePerTenantEntityModel } from './base-entity.model'
import { IRole } from './role.model'

export interface IRolePermission extends IBasePerTenantEntityModel {
  roleId: string
  permission: string
  role: IRole
  enabled: boolean
}

export interface IRolePermissionMigrateInput extends IBasePerTenantEntityModel {
  permission: string
  role: string
  isImporting: boolean
  sourceId: string
}

export interface IRolePermissionCreateInput extends IBasePerTenantEntityModel {
  roleId: string
  permission: string
  enabled: boolean
}

export interface IRolePermissionUpdateInput {
  enabled: boolean
}

export enum PermissionsEnum {
  PROFILE_EDIT = 'PROFILE_EDIT',
  ADMIN_DASHBOARD_VIEW = 'ADMIN_DASHBOARD_VIEW',
  ORG_EMPLOYEES_VIEW = 'ORG_EMPLOYEES_VIEW',
  ORG_EMPLOYEES_EDIT = 'ORG_EMPLOYEES_EDIT',
  ORG_TAGS_EDIT = 'ORG_TAGS_EDIT',
  ORG_USERS_VIEW = 'ORG_USERS_VIEW',
  ORG_USERS_EDIT = 'ORG_USERS_EDIT',
  ORG_INVITE_VIEW = 'ORG_INVITE_VIEW',
  ORG_INVITE_EDIT = 'ORG_INVITE_EDIT',
  ALL_ORG_VIEW = 'ALL_ORG_VIEW',
  ALL_ORG_EDIT = 'ALL_ORG_EDIT',
  APPROVAL_POLICY_VIEW = 'APPROVALS_POLICY_VIEW',
  APPROVAL_POLICY_EDIT = 'APPROVALS_POLICY_EDIT',
  CHANGE_SELECTED_ORGANIZATION = 'CHANGE_SELECTED_ORGANIZATION',
  CHANGE_ROLES_PERMISSIONS = 'CHANGE_ROLES_PERMISSIONS',
  SUPER_ADMIN_EDIT = 'SUPER_ADMIN_EDIT',
  PUBLIC_PAGE_EDIT = 'PUBLIC_PAGE_EDIT',
  VIEW_ALL_EMAILS = 'VIEW_ALL_EMAILS',
  VIEW_ALL_EMAIL_TEMPLATES = 'VIEW_ALL_EMAIL_TEMPLATES',
  ORG_HELP_CENTER_EDIT = 'ORG_HELP_CENTER_EDIT',
  ORG_CONTACT_EDIT = 'ORG_CONTACT_EDIT',
  ORG_CONTACT_VIEW = 'ORG_CONTACT_VIEW',
  ORG_DEMO_EDIT = 'ORG_DEMO_EDIT', // Orgnization demo edit permission
  INTEGRATION_EDIT = 'INTEGRATION_EDIT',
  INTEGRATION_VIEW = 'INTEGRATION_VIEW',
  DATA_SOURCE_VIEW = 'DATA_SOURCE_VIEW',
  DATA_SOURCE_EDIT = 'DATA_SOURCE_EDIT',
  FILE_STORAGE_VIEW = 'FILE_STORAGE_VIEW',
  SMS_GATEWAY_VIEW = 'SMS_GATEWAY_VIEW',
  CUSTOM_SMTP_VIEW = 'CUSTOM_SMTP_VIEW',
  VIEW_ALL_ACCOUNTING_TEMPLATES = 'VIEW_ALL_ACCOUNTING_TEMPLATES',
  ACCESS_DELETE_ACCOUNT = 'ACCESS_DELETE_ACCOUNT',
  ACCESS_DELETE_ALL_DATA = 'ACCESS_DELETE_ALL_DATA',
  REFERRAL_VIEW = 'REFERRAL_VIEW'
}

export const PermissionGroups = {
  //Permissions which can be given to any role
  GENERAL: [
    PermissionsEnum.PROFILE_EDIT,
    PermissionsEnum.ADMIN_DASHBOARD_VIEW,
    PermissionsEnum.ORG_INVITE_VIEW,
    PermissionsEnum.ORG_INVITE_EDIT,
    // PermissionsEnum.ORG_TAGS_EDIT,
    PermissionsEnum.VIEW_ALL_EMAILS,
    PermissionsEnum.VIEW_ALL_EMAIL_TEMPLATES,
    // PermissionsEnum.ORG_HELP_CENTER_EDIT,
    PermissionsEnum.INTEGRATION_EDIT,
    // PermissionsEnum.ORG_CONTACT_VIEW,
    PermissionsEnum.ORG_DEMO_EDIT,
    // PermissionsEnum.VIEW_ALL_ACCOUNTING_TEMPLATES,

    // AI
    AIPermissionsEnum.KNOWLEDGEBASE_EDIT,
    AIPermissionsEnum.COPILOT_VIEW,
    AIPermissionsEnum.COPILOT_EDIT,
    AIPermissionsEnum.MEMBERSHIP_EDIT,
    AIPermissionsEnum.MEMBERSHIP_USE,
    AIPermissionsEnum.MODEL_ACCESS_REQUEST_VIEW,
    AIPermissionsEnum.MODEL_ACCESS_REQUEST_EDIT,
    AIPermissionsEnum.MODEL_GATEWAY_USE,
    AIPermissionsEnum.MODEL_GATEWAY_MANAGE,
    AIPermissionsEnum.BILLING_PRODUCT_EDIT,
    AIPermissionsEnum.BILLING_REFUND,
    AIPermissionsEnum.PAYMENT_PROVIDER_EDIT,
    AIPermissionsEnum.XPERT_EDIT,
    AIPermissionsEnum.CHAT_VIEW,
    AIPermissionsEnum.EVOLUTION_VIEW,
    AIPermissionsEnum.EVOLUTION_MANAGE,

    // DataSource
    PermissionsEnum.DATA_SOURCE_VIEW,
    PermissionsEnum.DATA_SOURCE_EDIT
  ],

  //Readonly permissions, are only enabled for admin role
  ADMINISTRATION: [
    PermissionsEnum.ORG_USERS_VIEW,
    PermissionsEnum.ORG_USERS_EDIT,
    PermissionsEnum.ALL_ORG_VIEW,
    PermissionsEnum.ALL_ORG_EDIT,
    PermissionsEnum.CHANGE_SELECTED_ORGANIZATION,
    PermissionsEnum.CHANGE_ROLES_PERMISSIONS,
    PermissionsEnum.SUPER_ADMIN_EDIT,
    PermissionsEnum.INTEGRATION_VIEW,
    PermissionsEnum.ACCESS_DELETE_ACCOUNT,
    PermissionsEnum.ACCESS_DELETE_ALL_DATA,
    PermissionsEnum.REFERRAL_VIEW
  ]
}
