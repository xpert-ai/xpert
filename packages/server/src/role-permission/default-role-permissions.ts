import { PermissionsEnum, RolesEnum } from '@metad/contracts';

export const DEFAULT_ROLE_PERMISSIONS = [
	{
		role: RolesEnum.SUPER_ADMIN,
		defaultEnabledPermissions: [
			PermissionsEnum.ADMIN_DASHBOARD_VIEW,
			PermissionsEnum.ORG_EMPLOYEES_VIEW,
			PermissionsEnum.ORG_EMPLOYEES_EDIT,
			PermissionsEnum.ORG_HELP_CENTER_EDIT,
			PermissionsEnum.ORG_USERS_VIEW,
			PermissionsEnum.ORG_USERS_EDIT,
			PermissionsEnum.ALL_ORG_VIEW,
			PermissionsEnum.ALL_ORG_EDIT,
			PermissionsEnum.INTEGRATION_EDIT,
			// PermissionsEnum.POLICY_VIEW,
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
			// PermissionsEnum.ORG_TEAM_EDIT,
			// PermissionsEnum.ORG_CONTRACT_EDIT,
			// PermissionsEnum.EVENT_TYPES_VIEW,
			// PermissionsEnum.INTEGRATION_VIEW,
			// PermissionsEnum.IMPORT_EXPORT_VIEW,
			PermissionsEnum.FILE_STORAGE_VIEW,
			PermissionsEnum.SMS_GATEWAY_VIEW,
			PermissionsEnum.CUSTOM_SMTP_VIEW,
			PermissionsEnum.VIEW_ALL_ACCOUNTING_TEMPLATES,
			PermissionsEnum.ACCESS_DELETE_ACCOUNT,
			PermissionsEnum.ACCESS_DELETE_ALL_DATA
		]
	},
	{
		role: RolesEnum.ADMIN,
		defaultEnabledPermissions: [
			PermissionsEnum.ADMIN_DASHBOARD_VIEW,
			PermissionsEnum.ORG_EMPLOYEES_VIEW,
			PermissionsEnum.ORG_EMPLOYEES_EDIT,
			PermissionsEnum.ORG_HELP_CENTER_EDIT,
			PermissionsEnum.ORG_USERS_VIEW,
			PermissionsEnum.ORG_USERS_EDIT,
			PermissionsEnum.ALL_ORG_VIEW,
			PermissionsEnum.ALL_ORG_EDIT,
			PermissionsEnum.INTEGRATION_EDIT,
			// PermissionsEnum.POLICY_VIEW,
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
			// PermissionsEnum.ORG_TEAM_EDIT,
			// PermissionsEnum.ORG_CONTRACT_EDIT,
			PermissionsEnum.ORG_DEMO_EDIT,
			// PermissionsEnum.EVENT_TYPES_VIEW,
			// PermissionsEnum.INTEGRATION_VIEW,
			// PermissionsEnum.IMPORT_EXPORT_VIEW,
			PermissionsEnum.FILE_STORAGE_VIEW,
			PermissionsEnum.SMS_GATEWAY_VIEW,
			PermissionsEnum.CUSTOM_SMTP_VIEW,
			PermissionsEnum.VIEW_ALL_ACCOUNTING_TEMPLATES,
			PermissionsEnum.ACCESS_DELETE_ACCOUNT,
			PermissionsEnum.ACCESS_DELETE_ALL_DATA,
		]
	},
	{
		role: RolesEnum.DATA_ENTRY,
		defaultEnabledPermissions: [
			PermissionsEnum.CHANGE_SELECTED_ORGANIZATION,
			PermissionsEnum.ORG_HELP_CENTER_EDIT
		]
	},
	{
		role: RolesEnum.VIEWER,
		defaultEnabledPermissions: [
		]
	},
	{
		role: RolesEnum.EMPLOYEE,
		defaultEnabledPermissions: [
			PermissionsEnum.ADMIN_DASHBOARD_VIEW,
			// PermissionsEnum.EVENT_TYPES_VIEW,
			PermissionsEnum.ORG_CONTACT_VIEW,
		]
	},
	{
		role: RolesEnum.CANDIDATE,
		defaultEnabledPermissions: [
			PermissionsEnum.ADMIN_DASHBOARD_VIEW,
			PermissionsEnum.ORG_TAGS_EDIT
		]
	},
	{
		role: RolesEnum.TRIAL,
		defaultEnabledPermissions: [
			PermissionsEnum.ADMIN_DASHBOARD_VIEW,
			PermissionsEnum.ORG_TAGS_EDIT,
			PermissionsEnum.PROFILE_EDIT,
			PermissionsEnum.ORG_DEMO_EDIT,
			PermissionsEnum.INTEGRATION_EDIT,
		]
	}
];

export function setDefaultRolePermissions(role: RolesEnum, defaultEnabledPermissions: any[]) {
	const permissions = DEFAULT_ROLE_PERMISSIONS.find(rolePermission => rolePermission.role === role)
	if (permissions) {
		for(const permission of defaultEnabledPermissions) {
			if(permissions.defaultEnabledPermissions.indexOf(permission) === -1) {
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
