import { ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AuthGuard as PassportAuthGaurd } from '@nestjs/passport'

const CLIENT_SECRET_PREFIX = 'cs-x-'

@Injectable()
export class ApiKeyOrClientSecretAuthGuard extends PassportAuthGaurd('api-key') {
	constructor(private readonly _reflector: Reflector) {
		super()
	}

	canActivate(context: ExecutionContext) {
		const request = context.switchToHttp().getRequest()
		const clientSecret = request.headers['x-client-secret'] as string
		const authHeader = request.headers['authorization'] as string
		const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null
		const useClientSecret = Boolean(clientSecret) || (bearerToken && bearerToken.startsWith(CLIENT_SECRET_PREFIX))

		if (useClientSecret) {
			const ClientSecretGuard = PassportAuthGaurd('client-secret')
			const guard = new ClientSecretGuard()
			return guard.canActivate(context)
		}

		return super.canActivate(context)
	}
}
