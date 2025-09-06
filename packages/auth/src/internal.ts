import { FeishuController, FeishuStrategy } from './feishu';
import { Auth0Strategy, Auth0Controller } from './auth0';
import { FacebookStrategy, FacebookController } from './facebook';
import { GithubStrategy, GithubController } from './github';
import { GoogleStrategy, GoogleController } from './google';
import { LinkedinStrategy, LinkedinController } from './linkedin';
import { TwitterStrategy, TwitterController } from './twitter';

export const Strategies = [
	Auth0Strategy,
	FacebookStrategy,
	GithubStrategy,
	GoogleStrategy,
	// KeycloakStrategy,
	LinkedinStrategy,
	// MicrosoftStrategy,
	TwitterStrategy,
	FeishuStrategy,
	// DingtalkStrategy
];

export const Controllers = [
	Auth0Controller,
	FacebookController,
	GithubController,
	GoogleController,
	LinkedinController,
	TwitterController,
	// MicrosoftController,
	FeishuController,
	// DingtalkController
];

export const AuthGuards = [];
