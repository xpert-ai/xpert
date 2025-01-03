import { IRole } from './role.model';
import { IBasePerTenantEntityModel } from './base-entity.model';
import { ITag } from './tag-entity.model';
import { IEmployee } from './employee.model';
import { IOrganization } from './organization.model';

export interface IUser extends IBasePerTenantEntityModel {
	thirdPartyId?: string;
	name?: string;
	firstName?: string;
	lastName?: string;
	email?: string;
	mobile?: string
	username?: string;
	role?: IRole;
	roleId?: string;
	hash?: string;
	imageUrl?: string;
	employee?: IEmployee;
	employeeId?: string;
	tags?: ITag[];
	preferredLanguage?: string;
	paymentsId?: string;
	preferredComponentLayout?: string;
	fullName?: string;
	organizations?: IOrganization[];
	isImporting?: boolean;
	sourceId?: string;
	emailVerified?: boolean
	emailVerification?: IEmailVerification
	deletedAt?: Date
}

export interface IEmailVerification extends IBasePerTenantEntityModel {
	token: string
    userId: string
    user?: IUser
    validUntil: Date
}

export interface IUserFindInput {
	thirdPartyId?: string;
	firstName?: string;
	lastName?: string;
	email?: string;
	username?: string;
	role?: IRole;
	roleId?: string;
	hash?: string;
	imageUrl?: string;
	tags?: ITag[];
	preferredLanguage?: LanguagesEnum;
}

export interface IUserRegistrationInput {
	user: IUser;
	password?: string;
	confirmPassword?: string
	originalUrl?: string;
	organizationId?: string;
	createdById?: string;
	isImporting?: boolean;
	sourceId?: string;
}

export interface IUserLoginInput {
	email: string;
	password: string;
}

export interface IAuthResponse {
	user: IUser;
	token: string;
	refreshToken: string;
}
export interface IUserCreateInput {
	firstName?: string;
	lastName?: string;
	email?: string;
	username?: string;
	role?: IRole;
	roleId?: string;
	hash?: string;
	imageUrl?: string;
	tags?: ITag[];
	preferredLanguage?: LanguagesEnum;
	preferredComponentLayout?: ComponentLayoutStyleEnum;
}

export interface IUserUpdateInput {
	firstName?: string;
	lastName?: string;
	email?: string;
	username?: string;
	role?: IRole;
	roleId?: string;
	hash?: string;
	imageUrl?: string;
	tags?: ITag[];
	preferredLanguage?: LanguagesEnum;
	preferredComponentLayout?: ComponentLayoutStyleEnum;
}

export interface IUserPasswordInput {
	hash?: string;
	password?: string;
	confirmPassword?: string
}

/**
 * Browser http header `Language`
 */
export enum LanguagesEnum {
	Chinese = "zh-CN",
	SimplifiedChinese = "zh-Hans",
	TraditionalChinese = 'zh-Hant',
	English = 'en',
}

export const LanguagesMap = {
	'zh-CN': LanguagesEnum.SimplifiedChinese,
	'zh-Hans': LanguagesEnum.SimplifiedChinese,
	'zh': LanguagesEnum.SimplifiedChinese,
}

export enum ComponentLayoutStyleEnum {
	CARDS_GRID = 'CARDS_GRID',
	TABLE = 'TABLE'
}

export enum ProviderEnum {
	GOOGLE = 'google',
	FACEBOOK = 'facebook'
}

export interface IUserViewModel extends IBasePerTenantEntityModel {
	fullName: string;
	email: string;
	bonus?: number;
	endWork?: any;
	id: string;
	roleName?: string;
	role?: string;
	tags?: ITag[];
}
