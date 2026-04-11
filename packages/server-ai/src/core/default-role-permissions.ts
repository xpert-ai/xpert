import { AIPermissionsEnum, RolesEnum } from '@xpert-ai/contracts'

const FULL_AI_PERMISSIONS = [
	AIPermissionsEnum.KNOWLEDGEBASE_EDIT,
	AIPermissionsEnum.COPILOT_VIEW,
	AIPermissionsEnum.COPILOT_EDIT,
	AIPermissionsEnum.XPERT_EDIT,
	AIPermissionsEnum.CHAT_VIEW
]

const VIEWER_AI_PERMISSIONS = [
	AIPermissionsEnum.COPILOT_VIEW,
	AIPermissionsEnum.CHAT_VIEW
]

const ANALYTICS_BUILDER_AI_PERMISSIONS = [
	AIPermissionsEnum.COPILOT_VIEW,
	AIPermissionsEnum.XPERT_EDIT,
	AIPermissionsEnum.CHAT_VIEW
]

export const DEFAULT_ROLE_PERMISSIONS = [
	{
		role: RolesEnum.SUPER_ADMIN,
		defaultEnabledPermissions: [...FULL_AI_PERMISSIONS]
	},
	{
		role: RolesEnum.ADMIN,
		defaultEnabledPermissions: [...FULL_AI_PERMISSIONS]
	},
	{
		role: RolesEnum.TRIAL,
		defaultEnabledPermissions: [...FULL_AI_PERMISSIONS]
	},
	{
		role: RolesEnum.AI_BUILDER,
		defaultEnabledPermissions: [...FULL_AI_PERMISSIONS]
	},
	{
		role: RolesEnum.ANALYTICS_BUILDER,
		defaultEnabledPermissions: [...ANALYTICS_BUILDER_AI_PERMISSIONS]
	},
	{
		role: RolesEnum.VIEWER,
		defaultEnabledPermissions: [...VIEWER_AI_PERMISSIONS]
	}
]
