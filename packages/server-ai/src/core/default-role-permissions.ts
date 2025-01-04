import { AIPermissionsEnum, RolesEnum } from '@metad/contracts'

export const DEFAULT_ROLE_PERMISSIONS = [
	{
		role: RolesEnum.SUPER_ADMIN,
		defaultEnabledPermissions: [
			AIPermissionsEnum.KNOWLEDGEBASE_EDIT,
			AIPermissionsEnum.COPILOT_VIEW,
			AIPermissionsEnum.COPILOT_EDIT,
			AIPermissionsEnum.XPERT_EDIT,
			AIPermissionsEnum.CHAT_VIEW,
		]
	},
	{
		role: RolesEnum.ADMIN,
		defaultEnabledPermissions: [
			AIPermissionsEnum.KNOWLEDGEBASE_EDIT,
			AIPermissionsEnum.COPILOT_VIEW,
			AIPermissionsEnum.COPILOT_EDIT,
			AIPermissionsEnum.XPERT_EDIT,
			AIPermissionsEnum.CHAT_VIEW,
		]
	},
	{
		role: RolesEnum.DATA_ENTRY,
		defaultEnabledPermissions: [
			AIPermissionsEnum.KNOWLEDGEBASE_EDIT,
			AIPermissionsEnum.XPERT_EDIT,
			AIPermissionsEnum.CHAT_VIEW,
		]
	},
	{
		role: RolesEnum.VIEWER,
		defaultEnabledPermissions: [
			AIPermissionsEnum.COPILOT_VIEW,
			AIPermissionsEnum.CHAT_VIEW,
		]
	},
	{
		role: RolesEnum.EMPLOYEE,
		defaultEnabledPermissions: []
	},
	{
		role: RolesEnum.CANDIDATE,
		defaultEnabledPermissions: []
	},
	{
		role: RolesEnum.TRIAL,
		defaultEnabledPermissions: [
			AIPermissionsEnum.KNOWLEDGEBASE_EDIT,
			AIPermissionsEnum.COPILOT_VIEW,
			AIPermissionsEnum.COPILOT_EDIT,
			AIPermissionsEnum.XPERT_EDIT,
			AIPermissionsEnum.CHAT_VIEW,
		]
	}
]
