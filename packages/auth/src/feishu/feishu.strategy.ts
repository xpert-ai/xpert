import { IApiServerOptions } from '@xpert-ai/server-common';
import { ConfigService, IEnvironment } from '@xpert-ai/server-config';
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-feishu2';

@Injectable()
export class FeishuStrategy extends PassportStrategy(Strategy, 'feishu') {
	constructor(private readonly configService: ConfigService) {
		super(config(configService));
	}

	async validate(
		accessToken: string,
		refreshToken: string,
		profile: Profile,
		done: (err: any, user: any, info?: any) => void
	): Promise<any> {
		console.log(`profile:`, profile)
		try {
			const { id, open_id, name, email, mobile, avatar } = profile;
			const user = {
				username: id,
				thirdPartyId: open_id,
				name,
				mobile,
				imageUrl: avatar?.middle,
				accessToken
			} as any
			if (email) {
				user.emails = [{value: email}]
			}
			done(null, user);
		} catch (err) {
			done(err, false);
		}
	}
}

export const config = (configService: ConfigService) => {
	const FEISHU_CONFIG = configService.get(
		'larkConfig'
	) as IEnvironment['larkConfig']
	const { baseUrl } = configService.apiConfigOptions as IApiServerOptions;

	return {
		clientID: FEISHU_CONFIG.appId || 'disabled',
		clientSecret: FEISHU_CONFIG.appSecret || 'disabled',
		callbackURL:
			FEISHU_CONFIG.redirectUrl ||
			`${baseUrl}/api/auth/feishu/callback`,
		appType: FEISHU_CONFIG.appType,
		appTicket: function () {
			return new Promise((resolve, reject) => {
				setTimeout(function () {
					resolve("the-ticket-received-from-feishu-service")
				}, 1000)
			})
		}
	}
}
