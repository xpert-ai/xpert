import { AnalyticsPermissionsEnum, RolesEnum } from '@xpert-ai/contracts'

const FULL_ANALYTICS_PERMISSIONS = [
	AnalyticsPermissionsEnum.DATA_SOURCE_EDIT,
	AnalyticsPermissionsEnum.DATA_SOURCE_VIEW,
	AnalyticsPermissionsEnum.BUSINESS_AREA_EDIT,
	AnalyticsPermissionsEnum.BUSINESS_AREA_VIEW,
	AnalyticsPermissionsEnum.MODELS_EDIT,
	AnalyticsPermissionsEnum.MODELS_VIEW,
	AnalyticsPermissionsEnum.STORIES_EDIT,
	AnalyticsPermissionsEnum.STORIES_VIEW,
	AnalyticsPermissionsEnum.INDICATOR_EDIT,
	AnalyticsPermissionsEnum.INDICATOR_VIEW,
	AnalyticsPermissionsEnum.INDICATOR_MARTKET_VIEW,
	AnalyticsPermissionsEnum.NOTIFICATION_DESTINATION_EDIT,
	AnalyticsPermissionsEnum.NOTIFICATION_DESTINATION_VIEW,
	AnalyticsPermissionsEnum.CERTIFICATION_EDIT,
	AnalyticsPermissionsEnum.DATA_FACTORY_VIEW,
	AnalyticsPermissionsEnum.DATA_FACTORY_EDIT
]

const VIEWER_ANALYTICS_PERMISSIONS = [
	AnalyticsPermissionsEnum.MODELS_VIEW,
	AnalyticsPermissionsEnum.STORIES_VIEW,
	AnalyticsPermissionsEnum.BUSINESS_AREA_VIEW,
	AnalyticsPermissionsEnum.INDICATOR_VIEW,
	AnalyticsPermissionsEnum.INDICATOR_MARTKET_VIEW
]

const AI_BUILDER_ANALYTICS_PERMISSIONS = [
	AnalyticsPermissionsEnum.MODELS_VIEW,
	AnalyticsPermissionsEnum.STORIES_VIEW
]

const ANALYTICS_BUILDER_PERMISSIONS = [
	AnalyticsPermissionsEnum.DATA_SOURCE_EDIT,
	AnalyticsPermissionsEnum.DATA_SOURCE_VIEW,
	AnalyticsPermissionsEnum.BUSINESS_AREA_EDIT,
	AnalyticsPermissionsEnum.BUSINESS_AREA_VIEW,
	AnalyticsPermissionsEnum.MODELS_EDIT,
	AnalyticsPermissionsEnum.MODELS_VIEW,
	AnalyticsPermissionsEnum.STORIES_EDIT,
	AnalyticsPermissionsEnum.STORIES_VIEW,
	AnalyticsPermissionsEnum.INDICATOR_EDIT,
	AnalyticsPermissionsEnum.INDICATOR_VIEW,
	AnalyticsPermissionsEnum.INDICATOR_MARTKET_VIEW,
	AnalyticsPermissionsEnum.CERTIFICATION_EDIT,
	AnalyticsPermissionsEnum.DATA_FACTORY_VIEW,
	AnalyticsPermissionsEnum.DATA_FACTORY_EDIT
]

export const ANALYTICS_ROLE_PERMISSIONS = [
	{
		role: RolesEnum.SUPER_ADMIN,
		defaultEnabledPermissions: [...FULL_ANALYTICS_PERMISSIONS]
	},
	{
		role: RolesEnum.ADMIN,
		defaultEnabledPermissions: [...FULL_ANALYTICS_PERMISSIONS]
	},
	{
		role: RolesEnum.TRIAL,
		defaultEnabledPermissions: [...ANALYTICS_BUILDER_PERMISSIONS]
	},
	{
		role: RolesEnum.AI_BUILDER,
		defaultEnabledPermissions: [...AI_BUILDER_ANALYTICS_PERMISSIONS]
	},
	{
		role: RolesEnum.ANALYTICS_BUILDER,
		defaultEnabledPermissions: [...ANALYTICS_BUILDER_PERMISSIONS]
	},
	{
		role: RolesEnum.VIEWER,
		defaultEnabledPermissions: [...VIEWER_ANALYTICS_PERMISSIONS]
	}
]
