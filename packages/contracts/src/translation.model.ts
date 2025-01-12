import { IBasePerTenantAndOrganizationEntityModel } from './base-entity.model';
import { LanguagesEnum } from './user.model';

export interface ITranslation<T>
	extends IBasePerTenantAndOrganizationEntityModel {
	reference?: ITranslatable<T>;
	referenceId?: string;
	languageCode: string;
}

export interface ITranslatable<T>
	extends IBasePerTenantAndOrganizationEntityModel {
	translations?: ITranslation<T>[];

	translate?(languageCode : string): any;
	translateNested?(languageCode : string, translatePropsInput: Array<any>) : any;
}

export interface TranslateInput {
	key: string;
	alias: string;
}

export interface TranslatePropertyInput {
	prop: string;
	propsTranslate: Array<TranslateInput>;
	propAsArr?: Array<string>;
}

export const TranslationLanguageMap = {
	'zh-CN': 'zh',
	'zh-Hans': 'zh',
}

export function mapTranslationLanguage(languageCode: LanguagesEnum) {
	return TranslationLanguageMap[languageCode] || languageCode
}