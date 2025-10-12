import { IBasePerTenantAndOrganizationEntityModel } from './base-entity.model';

export interface IFeature extends IBasePerTenantAndOrganizationEntityModel {
	code: string;
	description: string;
	featureOrganizations?: IFeatureOrganization[];
	image?: string;
	readonly imageUrl?: string;
	link: string;
	name: string;
	status: string;
	icon: string;
	isEnabled?: boolean;
	isPaid?: boolean;
	readonly parentId?: string;
	parent?: IFeature;
	children?: IFeature[];
}
export interface IFeatureCreateInput extends IFeature {
	isEnabled: boolean;
}

export interface IFeatureOrganization
	extends IBasePerTenantAndOrganizationEntityModel {
	feature: IFeature;
	featureId?: string;
	isEnabled: boolean;
}

export interface IFeatureOrganizationUpdateInput
	extends IBasePerTenantAndOrganizationEntityModel {
	featureId: string;
	isEnabled: boolean;
}

export interface IFeatureOrganizationFindInput
	extends IBasePerTenantAndOrganizationEntityModel {
	featureId?: string;
}

export enum FeatureStatusEnum {
	INFO = 'info',
	PRIMARY = 'primary',
	SUCCESS = 'success',
	WARNING = 'warning'
}

export enum IFeatureToggleTypeEnum {
	RELEASE = 'release',
	KILL_SWITCH = 'kill-switch',
	EXPERIMENT = 'experiment',
	OPERATIONAL = 'operational',
	PERMISSION = 'permission'
}

export interface IFeatureToggleVariant {
	name?: string;
	weight?: number;
	weightType?: string;
	payload?: IFeatureTogglePayload;
	overrides?: IFeatureToggleOverride[];
}

export interface IFeatureToggleOverride {
	contextName?: string;
	values?: string[];
}

export interface IFeatureTogglePayload {
	type?: string;
	value?: string;
}

export interface IFeatureToggle {
	name: string;
	description?: string;
	type: IFeatureToggleTypeEnum;
	project?: string;
	enabled: boolean;
	stale?: boolean;
	strategies?: any;
	variants?: IFeatureToggleVariant[];
	createdAt?: string;
	lastSeenAt?: string | null;
}

export enum FeatureEnum {
	FEATURE_HOME = 'FEATURE_HOME',
	FEATURE_DASHBOARD = 'FEATURE_DASHBOARD',
	FEATURE_JOB = 'FEATURE_JOB',
	FEATURE_EMPLOYEES = 'FEATURE_EMPLOYEES',
	FEATURE_MANAGE_INVITE = 'FEATURE_MANAGE_INVITE',
	FEATURE_ORGANIZATION = 'FEATURE_ORGANIZATION',
	FEATURE_ORGANIZATION_TAG = 'FEATURE_ORGANIZATION_TAG',
	FEATURE_ORGANIZATION_PROJECT = 'FEATURE_ORGANIZATION_PROJECT',
	FEATURE_CONTACT = 'FEATURE_CONTACT',
	FEATURE_USER = 'FEATURE_USER',
	FEATURE_ORGANIZATIONS = 'FEATURE_ORGANIZATIONS',
	// FEATURE_APP_INTEGRATION = 'FEATURE_APP_INTEGRATION',
	FEATURE_SETTING = 'FEATURE_SETTING',
	FEATURE_EMAIL_HISTORY = 'FEATURE_EMAIL_HISTORY',
	FEATURE_EMAIL_TEMPLATE = 'FEATURE_EMAIL_TEMPLATE',
	FEATURE_FILE_STORAGE = 'FEATURE_FILE_STORAGE',
	FEATURE_SMS_GATEWAY = 'FEATURE_SMS_GATEWAY',
	FEATURE_SMTP = 'FEATURE_SMTP',
	FEATURE_ROLES_PERMISSION = 'FEATURE_ROLES_PERMISSION',
	FEATURE_INTEGRATION = 'FEATURE_INTEGRATION',
}
