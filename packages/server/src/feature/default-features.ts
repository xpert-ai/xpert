import { toggleFeatures } from '@xpert-ai/server-config';
import { FeatureEnum, IFeatureCreateInput } from '@xpert-ai/contracts';

const features = toggleFeatures;

export let DEFAULT_FEATURES: IFeatureCreateInput[] = [
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
		code: FeatureEnum.FEATURE_USER,
		description: 'Manage Tenant Users',
		image: 'user.png',
		link: 'users',
		isEnabled: features.FEATURE_USER,
		icon: 'file-text-outline',
		status: 'primary',
		children: [
			{
				name: 'Users',
				code: FeatureEnum.FEATURE_USERS,
				description: 'Manage Tenant Users',
				image: 'user.png',
				link: 'users',
				isEnabled: features.FEATURE_USERS,
				icon: 'file-text-outline',
				status: 'primary'
			},
			{
				name: 'User Groups',
				code: FeatureEnum.FEATURE_USER_GROUPS,
				description: 'Manage Organization User Groups',
				image: 'user.png',
				link: 'groups',
				isEnabled: features.FEATURE_USER_GROUPS,
				icon: 'file-text-outline',
				status: 'primary'
			}
		]
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
			},
			{
				name: 'Custom SMTP',
				code: 'FEATURE_SMTP',
				description: 'Manage Tenant & Organization Custom SMTP',
				image: 'smtp.png',
				link: 'settings/custom-smtp',
				isEnabled: features.FEATURE_SMTP,
				icon: 'file-text-outline',
				status: 'success'
			}
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
