import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AuthGuard as PassportAuthGaurd } from '@nestjs/passport'
import { IApiPrincipal, SecretTokenBindingType } from '@xpert-ai/contracts'
import { isObservable, lastValueFrom, Observable } from 'rxjs'
import { ALLOWED_CLIENT_SECRET_BINDINGS_METADATA } from '../decorators/allowed-client-secret-bindings.decorator'
import { CoreAuthGuard } from './core-auth.guard'

const CLIENT_SECRET_PREFIX = 'cs-x-'

@Injectable()
export class ApiKeyOrClientSecretAuthGuard extends PassportAuthGaurd('api-key') {
	constructor(private readonly _reflector: Reflector) {
		super()
	}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest()
		const clientSecret = request.headers['x-client-secret'] as string
		const authHeader = request.headers['authorization'] as string
		const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null
		const useClientSecret = Boolean(clientSecret) || (bearerToken && bearerToken.startsWith(CLIENT_SECRET_PREFIX))

		if (useClientSecret) {
			const authenticated = await this.resolveCanActivate(this.authenticateClientSecret(context))
			if (authenticated) {
				this.assertClientSecretBindingAllowed(context)
			}
			return authenticated
		}

		return this.tryApiKeyOrFallbackAuth(context)
	}

	protected authenticateClientSecret(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
		const ClientSecretGuard = PassportAuthGaurd('client-secret')
		const guard = new ClientSecretGuard()
		return guard.canActivate(context) as boolean | Promise<boolean> | Observable<boolean>
	}

	private assertClientSecretBindingAllowed(context: ExecutionContext) {
		const principal = context.switchToHttp().getRequest().user as IApiPrincipal | undefined
		if (principal?.clientSecretBindingType !== SecretTokenBindingType.ENTERPRISE_XPERT) {
			return
		}

		const allowedBindings = this._reflector.getAllAndOverride<SecretTokenBindingType[]>(
			ALLOWED_CLIENT_SECRET_BINDINGS_METADATA,
			[context.getHandler(), context.getClass()]
		)
		if (!allowedBindings?.includes(SecretTokenBindingType.ENTERPRISE_XPERT)) {
			throw new ForbiddenException()
		}
	}

	private async tryApiKeyOrFallbackAuth(context: ExecutionContext): Promise<boolean> {
		try {
			const apiKeyResult = await this.resolveCanActivate(super.canActivate(context))
			if (apiKeyResult) {
				return true
			}
		} catch (error) {
			// Ignore api-key errors and try JWT/basic/oidc.
		}

		const guard = new CoreAuthGuard(this._reflector)
		return this.resolveCanActivate(guard.canActivate(context))
	}

	private async resolveCanActivate(
		result: boolean | Promise<boolean> | Observable<boolean>
	): Promise<boolean> {
		if (isObservable(result)) {
			return lastValueFrom(result)
		}
		return await result
	}
}
