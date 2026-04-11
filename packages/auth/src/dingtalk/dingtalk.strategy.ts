// import { IApiServerOptions } from '@xpert-ai/server-common';
// import { ConfigService, IEnvironment } from '@xpert-ai/server-config';
// import { Injectable } from '@nestjs/common';
// import { PassportStrategy } from '@nestjs/passport';
// import { Strategy, Profile } from 'passport-dingtalk2';

// @Injectable()
// export class DingtalkStrategy extends PassportStrategy(Strategy, 'dingtalk') {
// 	constructor(private readonly configService: ConfigService) {
// 		super(config(configService));
// 	}

// 	async validate(
// 		accessToken: string,
// 		refreshToken: string,
// 		profile: Profile,
// 		done: (err: any, user: any, info?: any) => void
// 	): Promise<any> {
// 		try {
// 			const { id, name, email, mobile, headurl } = profile;
// 			const user = {
// 				thirdPartyId: id,
// 				name,
// 				mobile,
// 				imageUrl: headurl,
// 				accessToken
// 			} as any
// 			// if (email) {
// 			// 	user.emails = [{value: email}]
// 			// }
// 			done(null, user);
// 		} catch (err) {
// 			done(err, false);
// 		}
// 	}
// }

// export const config = (configService: ConfigService) => {
// 	const DINGTALK_CONFIG = configService.get(
// 		'dingtalkConfig'
// 	) as IEnvironment['dingtalkConfig']
// 	const { baseUrl } = configService.apiConfigOptions as IApiServerOptions;

// 	return {
// 		clientID: DINGTALK_CONFIG.clientId || 'disabled',
// 		clientSecret: DINGTALK_CONFIG.clientSecret || 'disabled',
// 		callbackURL:
// 			DINGTALK_CONFIG.redirectUrl ||
// 			`${baseUrl}/api/auth/dingtalk/callback`,
// 	}
// }
