import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import type { AccessTokenClaims, IUser } from '@xpert-ai/contracts'
import type { Request } from 'express'
import { AuthService } from '../auth.service'
import { applyTokenPermissionCeiling } from './jwt-permissions'

const extractToken = ExtractJwt.fromExtractors([
	ExtractJwt.fromAuthHeaderAsBearerToken(),
	ExtractJwt.fromHeader('x-api-key')
])

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
	constructor(
		private readonly authService: AuthService,
		private readonly configService: ConfigService
	) {
		super({
			passReqToCallback: true,
			jwtFromRequest: extractToken,
			ignoreExpiration: false,
			secretOrKey: configService.get('JWT_SECRET')
		})
	}

	async validate(request: Request, payload: AccessTokenClaims, done: any) {
		try {
			// We use this to also attach the user object to the request context.
			const user: IUser = await this.authService.getAuthenticatedUser(payload.id, payload.thirdPartyId, {
				token: extractToken(request),
				purpose: payload.purpose
			})

			if (!user) {
				return done(new UnauthorizedException('unauthorized'), false)
			} else {
				user.employeeId = payload.employeeId
				applyTokenPermissionCeiling(user, payload.permissions)

				done(null, user)
			}
		} catch (err) {
			console.error(err)
			return done(new UnauthorizedException('unauthorized', err.message), false)
		}
	}
}
