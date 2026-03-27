import { PermissionsEnum, RolesEnum } from '@metad/contracts'

const SUPER_ADMIN_PLATFORM_PERMISSIONS = [
	PermissionsEnum.PROFILE_EDIT,
	PermissionsEnum.ADMIN_DASHBOARD_VIEW,
	PermissionsEnum.ORG_EMPLOYEES_VIEW,
	PermissionsEnum.ORG_EMPLOYEES_EDIT,
	PermissionsEnum.ORG_HELP_CENTER_EDIT,
	PermissionsEnum.ORG_USERS_VIEW,
	PermissionsEnum.ORG_USERS_EDIT,
	PermissionsEnum.ALL_ORG_VIEW,
	PermissionsEnum.ALL_ORG_EDIT,
	PermissionsEnum.INTEGRATION_VIEW,
	PermissionsEnum.INTEGRATION_EDIT,
	PermissionsEnum.CHANGE_SELECTED_ORGANIZATION,
	PermissionsEnum.CHANGE_ROLES_PERMISSIONS,
	PermissionsEnum.ORG_INVITE_VIEW,
	PermissionsEnum.ORG_INVITE_EDIT,
	PermissionsEnum.SUPER_ADMIN_EDIT,
	PermissionsEnum.PUBLIC_PAGE_EDIT,
	PermissionsEnum.ORG_TAGS_EDIT,
	PermissionsEnum.VIEW_ALL_EMAILS,
	PermissionsEnum.VIEW_ALL_EMAIL_TEMPLATES,
	PermissionsEnum.ORG_CONTACT_EDIT,
	PermissionsEnum.ORG_CONTACT_VIEW,
	PermissionsEnum.ORG_DEMO_EDIT,
	PermissionsEnum.FILE_STORAGE_VIEW,
	PermissionsEnum.SMS_GATEWAY_VIEW,
	PermissionsEnum.CUSTOM_SMTP_VIEW,
	PermissionsEnum.VIEW_ALL_ACCOUNTING_TEMPLATES,
	PermissionsEnum.ACCESS_DELETE_ACCOUNT,
	PermissionsEnum.ACCESS_DELETE_ALL_DATA
]

const ADMIN_PLATFORM_PERMISSIONS = [
	PermissionsEnum.PROFILE_EDIT,
	PermissionsEnum.ADMIN_DASHBOARD_VIEW,
	PermissionsEnum.ORG_EMPLOYEES_VIEW,
	PermissionsEnum.ORG_EMPLOYEES_EDIT,
	PermissionsEnum.ORG_HELP_CENTER_EDIT,
	PermissionsEnum.ORG_USERS_VIEW,
	PermissionsEnum.ORG_USERS_EDIT,
	PermissionsEnum.ALL_ORG_VIEW,
	PermissionsEnum.ALL_ORG_EDIT,
	PermissionsEnum.INTEGRATION_VIEW,
	PermissionsEnum.INTEGRATION_EDIT,
	PermissionsEnum.CHANGE_SELECTED_ORGANIZATION,
	PermissionsEnum.CHANGE_ROLES_PERMISSIONS,
	PermissionsEnum.ORG_INVITE_VIEW,
	PermissionsEnum.ORG_INVITE_EDIT,
	PermissionsEnum.PUBLIC_PAGE_EDIT,
	PermissionsEnum.ORG_TAGS_EDIT,
	PermissionsEnum.VIEW_ALL_EMAILS,
	PermissionsEnum.VIEW_ALL_EMAIL_TEMPLATES,
	PermissionsEnum.ORG_CONTACT_EDIT,
	PermissionsEnum.ORG_CONTACT_VIEW,
	PermissionsEnum.ORG_DEMO_EDIT,
	PermissionsEnum.FILE_STORAGE_VIEW,
	PermissionsEnum.SMS_GATEWAY_VIEW,
	PermissionsEnum.CUSTOM_SMTP_VIEW,
	PermissionsEnum.VIEW_ALL_ACCOUNTING_TEMPLATES
]

const TRIAL_PLATFORM_PERMISSIONS = [
	PermissionsEnum.PROFILE_EDIT,
	PermissionsEnum.ADMIN_DASHBOARD_VIEW,
	PermissionsEnum.ORG_EMPLOYEES_VIEW,
	PermissionsEnum.ORG_EMPLOYEES_EDIT,
	PermissionsEnum.ORG_HELP_CENTER_EDIT,
	PermissionsEnum.ORG_USERS_VIEW,
	PermissionsEnum.ORG_USERS_EDIT,
	PermissionsEnum.ALL_ORG_VIEW,
	PermissionsEnum.ALL_ORG_EDIT,
	PermissionsEnum.INTEGRATION_VIEW,
	PermissionsEnum.INTEGRATION_EDIT,
	PermissionsEnum.CHANGE_SELECTED_ORGANIZATION,
	PermissionsEnum.CHANGE_ROLES_PERMISSIONS,
	PermissionsEnum.ORG_INVITE_VIEW,
	PermissionsEnum.ORG_INVITE_EDIT,
	PermissionsEnum.PUBLIC_PAGE_EDIT,
	PermissionsEnum.ORG_TAGS_EDIT,
	PermissionsEnum.VIEW_ALL_EMAILS,
	PermissionsEnum.VIEW_ALL_EMAIL_TEMPLATES,
	PermissionsEnum.ORG_CONTACT_EDIT,
	PermissionsEnum.ORG_CONTACT_VIEW,
	PermissionsEnum.ORG_DEMO_EDIT,
	PermissionsEnum.FILE_STORAGE_VIEW,
	PermissionsEnum.SMS_GATEWAY_VIEW,
	PermissionsEnum.CUSTOM_SMTP_VIEW,
	PermissionsEnum.VIEW_ALL_ACCOUNTING_TEMPLATES
]

const AI_BUILDER_PLATFORM_PERMISSIONS = [
	PermissionsEnum.PROFILE_EDIT,
	PermissionsEnum.ADMIN_DASHBOARD_VIEW,
	PermissionsEnum.CHANGE_SELECTED_ORGANIZATION,
	PermissionsEnum.ORG_INVITE_VIEW,
	PermissionsEnum.ORG_CONTACT_VIEW,
	PermissionsEnum.INTEGRATION_VIEW,
	PermissionsEnum.INTEGRATION_EDIT
]

const ANALYTICS_BUILDER_PLATFORM_PERMISSIONS = [
	PermissionsEnum.PROFILE_EDIT,
	PermissionsEnum.ADMIN_DASHBOARD_VIEW,
	PermissionsEnum.CHANGE_SELECTED_ORGANIZATION
]

const VIEWER_PLATFORM_PERMISSIONS = [
	PermissionsEnum.PROFILE_EDIT,
	PermissionsEnum.CHANGE_SELECTED_ORGANIZATION
]

export const DEFAULT_ROLE_PERMISSIONS = [
	{
		role: RolesEnum.SUPER_ADMIN,
		defaultEnabledPermissions: [...SUPER_ADMIN_PLATFORM_PERMISSIONS]
	},
	{
		role: RolesEnum.ADMIN,
		defaultEnabledPermissions: [...ADMIN_PLATFORM_PERMISSIONS]
	},
	{
		role: RolesEnum.TRIAL,
		defaultEnabledPermissions: [...TRIAL_PLATFORM_PERMISSIONS]
	},
	{
		role: RolesEnum.AI_BUILDER,
		defaultEnabledPermissions: [...AI_BUILDER_PLATFORM_PERMISSIONS]
	},
	{
		role: RolesEnum.ANALYTICS_BUILDER,
		defaultEnabledPermissions: [...ANALYTICS_BUILDER_PLATFORM_PERMISSIONS]
	},
	{
		role: RolesEnum.VIEWER,
		defaultEnabledPermissions: [...VIEWER_PLATFORM_PERMISSIONS]
	},
	{
		role: RolesEnum.DATA_ENTRY,
		defaultEnabledPermissions: [...ADMIN_PLATFORM_PERMISSIONS]
	},
	{
		role: RolesEnum.EMPLOYEE,
		defaultEnabledPermissions: [...VIEWER_PLATFORM_PERMISSIONS]
	},
	{
		role: RolesEnum.CANDIDATE,
		defaultEnabledPermissions: [...VIEWER_PLATFORM_PERMISSIONS]
	},
	{
		role: RolesEnum.MANAGER,
		defaultEnabledPermissions: [...ANALYTICS_BUILDER_PLATFORM_PERMISSIONS]
	}
]

export function setDefaultRolePermissions(role: RolesEnum, defaultEnabledPermissions: any[]) {
	const permissions = DEFAULT_ROLE_PERMISSIONS.find((rolePermission) => rolePermission.role === role)
	if (permissions) {
		for (const permission of defaultEnabledPermissions) {
			if (permissions.defaultEnabledPermissions.indexOf(permission) === -1) {
				permissions.defaultEnabledPermissions.push(permission)
			}
		}
	} else {
		DEFAULT_ROLE_PERMISSIONS.push({
			role,
			defaultEnabledPermissions
		})
	}
}
