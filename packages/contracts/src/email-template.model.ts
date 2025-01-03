import { IBasePerTenantAndOrganizationEntityModel } from './base-entity.model';
import { LanguagesEnum } from './user.model';

export interface IEmailTemplate
	extends IBasePerTenantAndOrganizationEntityModel {
	name: string;
	mjml: string;
	hbs: string;
	languageCode: string;
	title?: string;
}

export interface IEmailTemplateFindInput
	extends IBasePerTenantAndOrganizationEntityModel {
	name?: string;
	languageCode?: string;
}

export enum EmailTemplateNameEnum {
	PASSWORD_RESET = 'password',
	WELCOME_USER = 'welcome-user',
	INVITE_USER = 'invite-user',
	EMAIL_VERIFICATION = 'email-verification'
}

export enum EmailTemplateEnum {
	PASSWORD_RESET = 'password',
	MULTI_TENANT_PASSWORD_RESET = 'multi-tenant-password',
	PASSWORD_LESS_AUTHENTICATION = 'password-less-authentication',
	WELCOME_USER = 'welcome-user',
	EMAIL_VERIFICATION = 'email-verification',
	INVITE_USER = 'invite-user',
}

export interface ICustomizeEmailTemplateFindInput
	extends IBasePerTenantAndOrganizationEntityModel {
	name: EmailTemplateNameEnum;
	languageCode: LanguagesEnum;
}

export interface ICustomizableEmailTemplate {
	template: string;
	subject: string;
}

export interface IEmailTemplateSaveInput
	extends ICustomizeEmailTemplateFindInput {
	mjml: string;
	subject: string;
}

export const EmailLanguageCodeMap = {
	'zh-CN': 'zh',
	'zh-Hans': 'zh',
}