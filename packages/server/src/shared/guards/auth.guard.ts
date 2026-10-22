// Explicit strategies replace the default list and take precedence over Public.
// Strategy selection stays request-local: never mutate the shared guard's options.
import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AuthGuard as PassportAuthGuard } from '@nestjs/passport'
import { AUTH_STRATEGIES_METADATA, AuthenticationStrategy } from '../decorators/auth-strategies.decorator'

@Injectable()
export class AuthGuard extends PassportAuthGuard(['jwt', 'basic']) {
	constructor(private readonly _reflector: Reflector) {
		super()
	}

	canActivate(context: ExecutionContext) {
		const strategies = this._reflector.getAllAndOverride<AuthenticationStrategy[]>(AUTH_STRATEGIES_METADATA, [
			context.getHandler(),
			context.getClass()
		])
		if (strategies !== undefined) {
			if (!strategies.length) throw new UnauthorizedException()
			// Retain this guard's Passport options and hooks while selecting a fixed strategy list.
			return PassportAuthGuard(strategies).prototype.canActivate.call(this, context)
		}

		const isMethodPublic = this._reflector.get<boolean>('isPublic', context.getHandler())
		const isClassPublic = this._reflector.get<boolean>('isPublic', context.getClass())
		if (isMethodPublic || isClassPublic) {
			return true
		}

		return super.canActivate(context)
	}
}
