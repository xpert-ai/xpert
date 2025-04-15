import { FileStorageProviderEnum, VectorTypeEnum } from '@metad/contracts';
import {
	IAuth0Config,
	IAWSConfig,
	IFacebookConfig,
	IFiverrConfig,
	IGithubConfig,
	IGoogleConfig,
	IKeycloakConfig,
	ILinkedinConfig,
	IMicrosoftConfig,
	ISMTPConfig,
	ITwitterConfig,
	IUnleashConfig,
	IUpworkConfig,
	IDingtalkConfig,
	IAliyunConfig,
	ILarkConfig,
	IWecomConfig
} from '@metad/server-common';

export type LogLevel = 'verbose' | 'debug' | 'log' | 'warn' | 'error';

/**
 * environment variables that goes into process.env
 */
export interface Env {
	LOG_LEVEL?: LogLevel;
	[key: string]: string;
}

export interface FileSystem {
	name: FileStorageProviderEnum;
}

export interface IPACFeatures {
	[key: string]: boolean;
}

/**
 * Server Environment
 */
export interface IEnvironment {
	port: number | string;
	host: string;
	baseUrl: string;
	clientBaseUrl: string;

	production: boolean;
	envName: string;

	env?: Env;
	pro?: boolean
	
	EXPRESS_SESSION_SECRET: string;
	USER_PASSWORD_BCRYPT_SALT_ROUNDS?: number;
	JWT_SECRET?: string;
	JWT_REFRESH_SECRET?: string;
	jwtExpiresIn?: string;
	jwtRefreshExpiresIn?: string;
	mailVerificationUrl?: string;

	fileSystem: FileSystem;
	awsConfig?: IAWSConfig;
	aliyunConfig?: IAliyunConfig;

	facebookConfig: IFacebookConfig;
	googleConfig: IGoogleConfig;
	githubConfig: IGithubConfig;
	microsoftConfig: IMicrosoftConfig;
	linkedinConfig: ILinkedinConfig;
	twitterConfig: ITwitterConfig;
	fiverrConfig: IFiverrConfig;
	keycloakConfig: IKeycloakConfig;
	auth0Config: IAuth0Config;
	dingtalkConfig: IDingtalkConfig;
	larkConfig: ILarkConfig;
	wecomConfig: IWecomConfig;

	sentry?: {
		dns: string;
	};

	defaultHubstaffUserPass?: string;
	upworkConfig?: IUpworkConfig;
	isElectron?: boolean;
	allowSuperAdminRole?: boolean;

	smtpConfig?: ISMTPConfig;
	defaultCurrency: string;

	unleashConfig?: IUnleashConfig;
	
	demo: boolean;

	// Rag
	vectorStore?: VectorTypeEnum | string
}
