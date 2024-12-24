import { toggleFeatures } from '@metad/server-config';
import { FeatureEnum, IFeatureCreateInput } from '@metad/contracts';

const features = toggleFeatures;

export let DEFAULT_FEATURES: IFeatureCreateInput[] = [
	{
		name: 'Home',
		code: FeatureEnum.FEATURE_HOME,
		description: 'Home page, Data Dashboard',
		link: 'home',
		isEnabled: true,
		icon: 'home-outline',
		status: 'info',
		children: [
			{
				name: 'Dashboard',
				code: FeatureEnum.FEATURE_DASHBOARD,
				description: 'Go to home dashboard, View data dashboard',
				link: '',
				isEnabled: true,
				icon: 'dashboard-outline',
				status: 'primary'
			},
		]
	},
	{
		name: 'Manage Organization',
		code: 'FEATURE_ORGANIZATION',
		description: 'Manage Organization Details, Location and Settings',
		image: 'organization-detail.png',
		link: 'organizations',
		isEnabled: features.FEATURE_ORGANIZATION,
		icon: 'file-text-outline',
		status: 'info',
		children: [
			// {
			// 	name: 'Organization Tag',
			// 	code: 'FEATURE_ORGANIZATION_TAG',
			// 	description: 'Manage Organization Tag, Create First Tag',
			// 	image: 'tag.png',
			// 	link: 'organization/tags',
			// 	isEnabled: features.FEATURE_ORGANIZATION_TAG,
			// 	icon: 'file-text-outline',
			// 	status: 'primary'
			// },
		]
	},
	{
		name: 'Users',
		code: 'FEATURE_USER',
		description: 'Manage Tenant Users',
		image: 'user.png',
		link: 'users',
		isEnabled: features.FEATURE_USER,
		icon: 'file-text-outline',
		status: 'primary'
	},

	// {
	// 	name: 'Apps & Integrations',
	// 	code: 'FEATURE_APP_INTEGRATION',
	// 	description:
	// 		'Manage Available Apps & Integrations Like Upwork & Hubstaff',
	// 	image: 'app-integration.png',
	// 	link: 'integrations/list',
	// 	isEnabled: features.FEATURE_APP_INTEGRATION,
	// 	icon: 'file-text-outline',
	// 	status: 'warning'
	// },
	{
		name: 'Email',
		code: 'FEATURE_EMAIL',
		description: 'Manage Email',
		image: 'email-history.png',
		link: 'settings/email-history',
		isEnabled: features.FEATURE_EMAIL,
		icon: 'file-text-outline',
		status: 'info',
		children: [
			{
				name: 'Custom Email Template',
				code: 'FEATURE_EMAIL_TEMPLATE',
				description: 'Customize Email Template',
				image: 'email-template.png',
				link: 'settings/email-templates',
				isEnabled: features.FEATURE_EMAIL_TEMPLATE,
				icon: 'file-text-outline',
				status: 'info'
			}
		]
	},
	{
		name: 'Setting',
		code: 'FEATURE_SETTING',
		description: 'Manage Setting',
		image: 'email-history.png',
		link: 'settings',
		isEnabled: features.FEATURE_SETTING,
		icon: 'file-text-outline',
		status: 'primary',
		children: [
			{
				name: 'File Storage',
				code: 'FEATURE_FILE_STORAGE',
				description: 'Manage File Storage Provider',
				image: 'file-storage.png',
				link: 'settings/file-storage',
				isEnabled: features.FEATURE_FILE_STORAGE,
				icon: 'file-text-outline',
				status: 'info'
			},
			// {
			// 	name: 'SMS Gateway',
			// 	code: 'FEATURE_SMS_GATEWAY',
			// 	description: 'Manage SMS Gateway',
			// 	image: 'sms-gateway.png',
			// 	link: 'tasks/me',
			// 	isEnabled: features.FEATURE_SMS_GATEWAY,
			// 	icon: 'file-text-outline',
			// 	status: 'primary'
			// }
		]
	},
	// {
	// 	name: 'Entity Import & Export',
	// 	code: 'FEATURE_IMPORT_EXPORT',
	// 	description: 'Manage Entity Import and Export',
	// 	image: 'import.png',
	// 	link: 'settings/import-export',
	// 	isEnabled: features.FEATURE_IMPORT_EXPORT,
	// 	icon: 'file-text-outline',
	// 	status: 'warning'
	// },
	{
		name: 'Custom SMTP',
		code: 'FEATURE_SMTP',
		description: 'Manage Tenant & Organization Custom SMTP',
		image: 'smtp.png',
		link: 'settings/custom-smtp',
		isEnabled: features.FEATURE_SMTP,
		icon: 'file-text-outline',
		status: 'success'
	},
	{
		name: 'Roles & Permissions',
		code: 'FEATURE_ROLES_PERMISSION',
		description: 'Manage Roles & Permissions',
		image: 'role-permission.png',
		link: 'settings/roles',
		isEnabled: features.FEATURE_ROLES_PERMISSION,
		icon: 'home-outline',
		status: 'primary'
	},

	{
		name: 'Integration',
		code: FeatureEnum.FEATURE_INTEGRATION,
		description: 'Enable Integration',
		image: 'integration.png',
		link: 'settings/integration',
		isEnabled: features.FEATURE_INTEGRATION,
		icon: 'assistant',
		status: 'accent',
	}
];

export function setDefaultFeatures(features: IFeatureCreateInput[]) {
	DEFAULT_FEATURES = features
}

export function getFeatureToggleDefinitions(): IFeatureCreateInput[] {
	return DEFAULT_FEATURES
}