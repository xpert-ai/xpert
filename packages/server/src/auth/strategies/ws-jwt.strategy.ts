import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { IRolePermission, IUser } from '@xpert-ai/contracts'
import { AuthService } from '../auth.service'

type JwtPayload = {
	id: string
	thirdPartyId?: string
	employeeId?: string
	permissions?: string[]
}

type WsJwtHandshake = {
	auth?: {
		token?: unknown
	}
	headers?: {
		authorization?: unknown
	}
	query?: {
		token?: unknown
	}
	_query?: {
		token?: unknown
	}
}

function extractWsJwt(request: unknown): string | null {
	if (!request || typeof request !== 'object') {
		return null
	}

	const handshake = request as WsJwtHandshake
	const authToken = normalizeToken(handshake.auth?.token)
	if (authToken) {
		return authToken
	}

	const headerToken = normalizeBearerToken(handshake.headers?.authorization)
	if (headerToken) {
		return headerToken
	}

	return normalizeToken(handshake.query?.token) ?? normalizeToken(handshake._query?.token)
}

function normalizeBearerToken(value: unknown): string | null {
	const header = normalizeToken(value)
	if (!header) {
		return null
	}
	return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : header
}

function normalizeToken(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null
}

function attachTokenPermissions(user: IUser, permissions?: string[]) {
	if (!user?.role || !permissions?.length) {
		return
	}

	const roleId = user.roleId ?? user.role.id
	user.role = {
		...user.role,
		rolePermissions: permissions.map<IRolePermission>((permission) => ({
			roleId,
			role: user.role,
			tenantId: user.tenantId,
			permission,
			enabled: true
		}))
	}
}

@Injectable()
export class WsJwtStrategy extends PassportStrategy(Strategy, 'ws-jwt') {
	constructor(
		private readonly authService: AuthService,
		private readonly configService: ConfigService
	) {
		super({
			// jwtFromRequest: ExtractJwt.fromUrlQueryParameter('jwt-token'),
			/**
			 * https://socket.io/docs/v4/middlewares/#sending-credentials
			 */
			jwtFromRequest: ExtractJwt.fromExtractors([
				(request) => {
					return extractWsJwt(request)
				}
			]),
			secretOrKey: configService.get('JWT_SECRET')
		})
	}

	async validate(payload: JwtPayload, done: any) {
		try {
			// We use this to also attach the user object to the request context.
			const user: IUser = await this.authService.getAuthenticatedUser(payload.id, payload.thirdPartyId)

			if (!user) {
				return done(new UnauthorizedException('unauthorized'), false)
			} else {
				user.employeeId = payload.employeeId
				attachTokenPermissions(user, payload.permissions)

				// You could add a function to the authService to verify the claims of the token:
				// i.e. does the user still have the roles that are claimed by the token
				// const validClaims = await this.authService.verifyTokenClaims(payload);

				// if (!validClaims)
				//    return done(new UnauthorizedException('invalid token claims'), false);

				done(null, user)
			}
		} catch (err) {
			console.error(err)
			return done(new UnauthorizedException('unauthorized', err.message), false)
		}
	}
}
