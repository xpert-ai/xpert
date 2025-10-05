import {
	IBasePerTenantAndOrganizationEntityModel
} from './base-entity.model';
import { IOrganizationProjectsUpdateInput } from './organization-projects.model';
import { IOrganizationUpdateInput } from './organization.model';
import { ITag } from './tag-entity.model';
import { I18nObject, TAvatar, TParameterSchema } from './types';


export interface IIntegration<T = any> extends IBasePerTenantAndOrganizationEntityModel {
	name: string
	description?: string
	/**
     * avatar object
     */
	avatar?: TAvatar
	slug: string;
	provider: IntegrationEnum

	/**
	 * Integration features: ['knowledge', 'agent', ...]
	 */
	features?: IntegrationFeatureEnum[]

	/**
	 * Custom options for different providers
	 */
	options?: T

	tags?: ITag[]
}

export interface IIntegrationFilter {
	integrationTypeId: string;
	searchQuery: string;
	filter: string;
}

export interface IIntegrationMapSyncProject 
	extends IBasePerTenantAndOrganizationEntityModel {
	organizationProjectInput: IOrganizationProjectsUpdateInput;
	integrationId: string;
	sourceId: number;
}

export interface IIntegrationMapSyncOrganization 
	extends IBasePerTenantAndOrganizationEntityModel {
	organizationInput: IOrganizationUpdateInput;
	integrationId: string;
	sourceId: number;
}

/**
 * @deprecated use Plugins instead
 */
export enum IntegrationEnum {
	UPWORK = 'Upwork',
	HUBSTAFF = 'Hubstaff',
	LARK = 'Lark',
	DINGTALK = 'DingTalk',
	WECOM = 'WeCom',
	FIRECRAWL = 'firecrawl',
	KNOWLEDGEBASE = 'knowledgebase',
	GITHUB = 'github',
	RAGFlow = 'ragflow',
	Dify = 'dify',
	FastGPT = 'fastgpt',
}

export enum IntegrationFeatureEnum {
	KNOWLEDGE = 'knowledge',
	AGENT = 'agent',
	SSO = 'sso',
}

export enum IntegrationFilterEnum {
	ALL = 'All',
	FREE = 'Free',
	PAID = 'Paid'
}

export const DEFAULT_INTEGRATION_PAID_FILTERS = [
	{
		label: IntegrationFilterEnum.ALL,
		value: 'all'
	},
	{
		label: IntegrationFilterEnum.FREE,
		value: 'false'
	},
	{
		label: IntegrationFilterEnum.PAID,
		value: 'true'
	}
];

export interface IDateRangeActivityFilter {
	start: Date;
	end: Date;
}

export type TIntegrationProvider = {
	name: string
	label: I18nObject
	description?: I18nObject
	avatar?: string
	icon?: {
		svg: string
		color: string
	}
	webhook?: boolean
	schema?: TParameterSchema
	features?: IntegrationFeatureEnum[]
	helpUrl?: string
	
	webhookUrl?: (integration: IIntegration, baseUrl: string) => string
	pro?: boolean
}