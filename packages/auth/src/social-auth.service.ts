import { Injectable } from '@nestjs/common';
import { ConfigService, IEnvironment } from '@metad/server-config';
import * as bcrypt from 'bcryptjs';

/**
 * Base class for social authentication.
 */
export abstract class BaseSocialAuth {
	/**
	 * Validate OAuth login email.
	 *
	 * @param args - Arguments for validating OAuth login email.
	 * @returns The result of the validation.
	 */
	public abstract validateOAuthLoginEmail(args: []): any;

	public abstract validateOAuthLoginMobile(args: string): any;
}

@Injectable()
export class SocialAuthService extends BaseSocialAuth {
	protected readonly configService: ConfigService;
	protected readonly saltRounds: number;
	protected readonly clientBaseUrl: string;

	constructor() {
		super();
		this.configService = new ConfigService();
		this.saltRounds = this.configService.get(
			'USER_PASSWORD_BCRYPT_SALT_ROUNDS'
		) as number;
		this.clientBaseUrl = this.configService.get(
			'clientBaseUrl'
		) as keyof IEnvironment;
	}

	public validateOAuthLoginEmail(args: []): any {
		//
	}
	public validateOAuthLoginUser(args: any): any {
		//
	}
	public validateOAuthLoginMobile(args: any): any {
		//
	}

	public async getPasswordHash(password: string): Promise<string> {
		return bcrypt.hash(password, this.saltRounds);
	}

	// Redirect frontend
	public async routeRedirect(
		success: boolean,
		auth: {
			// 当前网站的 Token
			jwt: string;
			// 当前网站的 RefreshToken
			refreshToken: string;
			userId: string;
			emails: {value: string}[];
			accessToken: string;
		},
		res: any
	) {
		const { userId, jwt, refreshToken, emails, accessToken } = auth;

		if (success) {
			return res.redirect(
				`${this.clientBaseUrl}/sign-in/success?jwt=${jwt}&refreshToken=${refreshToken}&userId=${userId}`
			);
		} else {
			return res.redirect(`${this.clientBaseUrl}/auth/register?email=${emails?.[0]?.value}&access-token=${accessToken}`);
		}
	}
}
