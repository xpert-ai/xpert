import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { IUser } from '@metad/contracts';
import { AuthService } from '../auth.service';

type JwtPayload = {
	id: string
	thirdPartyId: string
	employeeId: string
	username: string
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
	constructor(private readonly authService: AuthService, private readonly configService: ConfigService) {
		super({
			jwtFromRequest: ExtractJwt.fromExtractors([
				ExtractJwt.fromAuthHeaderAsBearerToken(),
				ExtractJwt.fromHeader('x-api-key'), // when `jwt` in `x-api-key` header
			]),
			ignoreExpiration: false,
			secretOrKey: configService.get('JWT_SECRET')
		});
	}

	async validate(payload: JwtPayload, done: any) {
		try {
			// We use this to also attach the user object to the request context.
			const user: IUser = await this.authService.getAuthenticatedUser(
				payload.id,
				payload.thirdPartyId
			);

			if (!user) {
				return done(new UnauthorizedException('unauthorized'), false);
			} else {
				user.employeeId = payload.employeeId;

				// You could add a function to the authService to verify the claims of the token:
				// i.e. does the user still have the roles that are claimed by the token
				// const validClaims = await this.authService.verifyTokenClaims(payload);

				// if (!validClaims)
				//    return done(new UnauthorizedException('invalid token claims'), false);

				done(null, user);
			}
		} catch (err) {
			console.error(err);
			return done(
				new UnauthorizedException('unauthorized', err.message),
				false
			);
		}
	}
}
