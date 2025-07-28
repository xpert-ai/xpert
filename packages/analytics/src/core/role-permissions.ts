import { AnalyticsPermissionsEnum, RolesEnum } from '@metad/contracts'

export const ANALYTICS_ROLE_PERMISSIONS = [
	{
		role: RolesEnum.SUPER_ADMIN,
		defaultEnabledPermissions: [
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
        ],
	},
	{
		role: RolesEnum.ADMIN,
		defaultEnabledPermissions: [
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
        ],
	},
	{
		role: RolesEnum.DATA_ENTRY,
		defaultEnabledPermissions: [
			AnalyticsPermissionsEnum.DATA_SOURCE_VIEW,
			AnalyticsPermissionsEnum.BUSINESS_AREA_VIEW,
			AnalyticsPermissionsEnum.MODELS_EDIT,
			AnalyticsPermissionsEnum.MODELS_VIEW,
			AnalyticsPermissionsEnum.STORIES_EDIT,
			AnalyticsPermissionsEnum.STORIES_VIEW,
			AnalyticsPermissionsEnum.INDICATOR_EDIT,
			AnalyticsPermissionsEnum.INDICATOR_VIEW,
			AnalyticsPermissionsEnum.INDICATOR_MARTKET_VIEW,
			AnalyticsPermissionsEnum.NOTIFICATION_DESTINATION_VIEW,
			AnalyticsPermissionsEnum.SUBSCRIPTION_EDIT,
			AnalyticsPermissionsEnum.SUBSCRIPTION_VIEW,
			AnalyticsPermissionsEnum.DATA_FACTORY_VIEW,
			AnalyticsPermissionsEnum.DATA_FACTORY_EDIT
		]
	},
	{
		role: RolesEnum.VIEWER,
		defaultEnabledPermissions: [
			AnalyticsPermissionsEnum.MODELS_VIEW,
			AnalyticsPermissionsEnum.STORIES_VIEW,
			AnalyticsPermissionsEnum.INDICATOR_VIEW,
			AnalyticsPermissionsEnum.INDICATOR_MARTKET_VIEW,
		]
	},
    {
        role: RolesEnum.TRIAL,
        defaultEnabledPermissions: [
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
			AnalyticsPermissionsEnum.SUBSCRIPTION_EDIT,
			AnalyticsPermissionsEnum.SUBSCRIPTION_VIEW,
			AnalyticsPermissionsEnum.CERTIFICATION_EDIT,
			AnalyticsPermissionsEnum.DATA_FACTORY_VIEW,
			AnalyticsPermissionsEnum.DATA_FACTORY_EDIT
        ]
    }
]
