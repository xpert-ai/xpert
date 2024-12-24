import { AnalyticsFeatures, FeatureEnum, AiFeatureEnum, IFeatureCreateInput } from '@metad/contracts'
import { toggleFeatures } from '@metad/server-config'

const features = toggleFeatures

export const DEFAULT_FEATURES: Partial<IFeatureCreateInput>[] = [
	{
		code: FeatureEnum.FEATURE_HOME,
		children: [
			{
				name: 'Catalog',
				code: AnalyticsFeatures.FEATURE_HOME_CATALOG,
				description: 'Catalog of Story, Indicator and Models',
				link: 'catalog',
				isEnabled: true,
				icon: 'catalog-outline',
				status: 'primary'
			},
			{
				name: 'Trend',
				code: AnalyticsFeatures.FEATURE_HOME_TREND,
				description: 'Trend of Public Story Dashboards',
				link: 'trend',
				isEnabled: true,
				icon: 'trend-outline',
				status: 'primary'
			},
		]
	},
	{
		name: 'Business Area',
		code: AnalyticsFeatures.FEATURE_BUSINESS_AREA,
		description: 'Manage Business Areas',
		image: 'estimate.png',
		link: 'business-area',
		isEnabled: true,
		icon: 'file-text-outline',
		status: 'success',
	},
    {
		name: 'Indicator',
		code: AnalyticsFeatures.FEATURE_INDICATOR,
		description: 'Manage Indicators, Create First Indicator',
		image: 'estimate.png',
		link: 'indicator/market',
		isEnabled: true,
		icon: 'file-text-outline',
		status: 'success',
		children: [
			{
				name: 'Indicator Market',
				code: AnalyticsFeatures.FEATURE_INDICATOR_MARKET,
				description:
					'Manage Indicator, View and Subscribe Indicator',
				image: 'estimate-received.png',
				link: 'indicator/market',
				isEnabled: true,
				icon: 'file-text-outline',
				status: 'warning'
			},
            {
				name: 'Indicator Creation',
				code: AnalyticsFeatures.FEATURE_INDICATOR_REGISTER,
				description: 'Create Indicator',
				image: 'estimate-received.png',
				link: 'indicator/create',
				isEnabled: true,
				icon: 'file-text-outline',
				status: 'warning'
			},
            {
				name: 'Indicator Application',
				code: AnalyticsFeatures.FEATURE_INDICATOR_APP,
				description: 'View Indicators in Application',
				image: 'indicator.png',
				link: 'indicator-app',
				isEnabled: true,
				icon: 'file-text-outline',
				status: 'warning'
			}
		]
	},
	{
		name: 'Semantic Model',
		code: AnalyticsFeatures.FEATURE_MODEL,
		description: 'Manage and View Semantic Model',
		image: 'estimate.png',
		link: 'model',
		isEnabled: true,
		icon: 'file-text-outline',
		status: 'success',
	},
	{
		name: 'Story',
		code: AnalyticsFeatures.FEATURE_STORY,
		description: 'Manage and View Story',
		image: 'estimate.png',
		link: 'story',
		isEnabled: true,
		icon: 'file-text-outline',
		status: 'success',
	},
	{
		name: 'Project',
		code: AnalyticsFeatures.FEATURE_PROJECT,
		description: 'Go to Project, Manage Story and Indicator',
		image: 'project.png',
		link: 'project',
		isEnabled: true,
		icon: 'project-outline',
		status: 'success',
	},
	{
		name: 'Data Factory',
		code: AnalyticsFeatures.FEATURE_DATA_FACTORY,
		description: 'Go to data factory to manage data',
		image: 'data-factory.png',
		link: 'data',
		isEnabled: true,
		icon: 'data-factory',
		status: 'success',
	},
	{
		code: AiFeatureEnum.FEATURE_COPILOT,
		children: [
			{
				name: 'Copilot ChatBI',
				code: AnalyticsFeatures.FEATURE_COPILOT_CHATBI,
				description: 'Manage ChatBI of Copilot',
				image: 'file-storage.png',
				link: 'settings/chatbi',
				isEnabled: features.FEATURE_COPILOT_CHATBI,
				icon: 'file-text-outline',
				status: 'info'
			},
		]
	}
]