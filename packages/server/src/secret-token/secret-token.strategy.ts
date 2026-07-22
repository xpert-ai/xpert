import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ApiKeyBindingType, IApiKey, IApiPrincipal, ISecretToken, SecretTokenBindingType } from '@xpert-ai/contracts'
import { IncomingMessage } from 'http'
import { Strategy } from 'passport'
import { ApiKeyService } from '../api-key/api-key.service'
import {
	applyRequestedOrganizationScopeHeaders,
	buildApiKeyPrincipal,
	resolveApiKeyRequestedOrganizationId
} from '../api-key/api-key-principal'
import { UserService } from '../user'
import { SecretTokenService } from './secret-token.service'

/**
 * The secretToken belongs to the user, but apiKey belongs to system.
 */
@Injectable()
export class SecretTokenStrategy extends PassportStrategy(Strategy, 'client-secret') {
	constructor(
		private readonly secretTokenService: SecretTokenService,
		private readonly apiKeyService: ApiKeyService,
		private readonly userService: UserService
	) {
		super()
	}

	validate(...args: any[]): unknown {
		throw new Error('Method not implemented.')
	}

	authenticate(req: IncomingMessage, options: { session: boolean }) {
		let token = req.headers['x-client-secret'] as string
		if (!token) {
			const authHeader = req.headers['authorization']
			if (!authHeader || !authHeader.startsWith('Bearer ')) {
				return this.fail(new UnauthorizedException('Authorization header not provided or invalid'))
			}

			token = authHeader.split(' ')[1]
		}

		const requestedOrganizationId = resolveApiKeyRequestedOrganizationId(req)

		this.validateToken(token)
			.then(async ({ apiKey, secretToken }) => {
				// Resolve the principal from the explicit binding type. createdById is
				// shared provenance metadata and cannot tell API_KEY, USER_XPERT and
				// PUBLIC_XPERT grants apart.
				if (this.isPublicXpertToken(secretToken)) {
					const principal = await this.resolvePublicXpertPrincipal(secretToken)
					applyRequestedOrganizationScopeHeaders(req, principal?.requestedOrganizationId)
					this.success(principal)
					return
				}
				if (this.isUserXpertToken(secretToken)) {
					const principal = await this.resolveUserXpertPrincipal(secretToken)
					applyRequestedOrganizationScopeHeaders(req, principal?.requestedOrganizationId)
					this.success(principal)
					return
				}

				if (!secretToken?.createdById) {
					return this.fail(new UnauthorizedException('Invalid token'))
				}
				if (!apiKey) {
					return this.fail(new UnauthorizedException('Invalid token'))
				}

				const principal = await this.apiKeyService.resolvePrincipal(apiKey, {
					requestedUserId: secretToken.createdById,
					requestedOrganizationId,
					principalType: 'client_secret'
				})
				principal.clientSecretBindingType = secretToken.type ?? SecretTokenBindingType.API_KEY
				principal.clientSecretId = secretToken.id ?? null
				applyRequestedOrganizationScopeHeaders(req, principal?.requestedOrganizationId)
				this.success(principal)
			})
			.catch((err) => {
				return this.error(new UnauthorizedException('Unauthorized', err.message))
			})
	}

	private isPublicXpertToken(secretToken: ISecretToken) {
		return secretToken?.type === SecretTokenBindingType.PUBLIC_XPERT
	}

	private isUserXpertToken(secretToken: ISecretToken) {
		return secretToken?.type === SecretTokenBindingType.USER_XPERT
	}

	/**
	 * Restore an interactive user delegation without loading a long-lived API
	 * key. The synthetic assistant binding supplies the resource scope expected
	 * by downstream authorization, while actingUser remains the real user for
	 * permissions and audit.
	 */
	private async resolveUserXpertPrincipal(secretToken: ISecretToken): Promise<IApiPrincipal> {
		if (!secretToken?.entityId || !secretToken.tenantId || !secretToken.createdById) {
			throw new UnauthorizedException('Invalid user xpert token')
		}

		const actingUser = await this.userService.findOneByIdWithinTenant(
			secretToken.createdById,
			secretToken.tenantId,
			{
				relations: ['role', 'role.rolePermissions', 'employee']
			}
		)
		const apiKey = {
			id: secretToken.id,
			token: '',
			type: ApiKeyBindingType.ASSISTANT,
			entityId: secretToken.entityId,
			tenantId: secretToken.tenantId,
			organizationId: secretToken.organizationId ?? null,
			createdById: actingUser.id,
			userId: actingUser.id,
			user: actingUser
		} as IApiKey

		const principal = buildApiKeyPrincipal(apiKey, {
			actingUser,
			requestedUserId: actingUser.id,
			requestedOrganizationId: secretToken.organizationId ?? null,
			principalType: 'client_secret'
		})
		principal.clientSecretBindingType = SecretTokenBindingType.USER_XPERT
		principal.clientSecretId = secretToken.id ?? null
		return principal
	}

	private async resolvePublicXpertPrincipal(secretToken: ISecretToken): Promise<IApiPrincipal> {
		if (!secretToken?.entityId || !secretToken.tenantId || !secretToken.createdById) {
			throw new UnauthorizedException('Invalid public xpert token')
		}

		const actingUser = await this.userService.findOneByIdWithinTenant(
			secretToken.createdById,
			secretToken.tenantId,
			{
				relations: ['role', 'role.rolePermissions', 'employee']
			}
		)
		const apiKey = {
			id: secretToken.id,
			token: '',
			type: ApiKeyBindingType.ASSISTANT,
			entityId: secretToken.entityId,
			tenantId: secretToken.tenantId,
			organizationId: secretToken.organizationId ?? null,
			createdById: actingUser.id,
			userId: actingUser.id,
			user: actingUser
		} as IApiKey

		const principal = buildApiKeyPrincipal(apiKey, {
			actingUser,
			requestedOrganizationId: secretToken.organizationId ?? null,
			principalType: 'client_secret'
		})
		principal.clientSecretBindingType = SecretTokenBindingType.PUBLIC_XPERT
		principal.clientSecretId = secretToken.id ?? null
		return principal
	}

	private async validateToken(token: string) {
		const secretToken = await this.secretTokenService.findOneByOptions({
			where: { token },
			order: { createdAt: 'DESC' }
		})

		if (!secretToken?.validUntil || secretToken.validUntil <= new Date() || secretToken.expired) {
			throw new UnauthorizedException('Token expired')
		}

		// These bindings point directly at a Xpert; entityId is not an ApiKey id.
		if (this.isPublicXpertToken(secretToken) || this.isUserXpertToken(secretToken)) {
			return { apiKey: null, secretToken }
		}

		const { record: apiKey } = await this.apiKeyService.findOneOrFailByIdString(secretToken.entityId, {
			relations: ['createdBy', 'user']
		})
		if (apiKey) {
			if (apiKey.validUntil && apiKey.validUntil <= new Date()) {
				throw new UnauthorizedException('ApiKey expired')
			}
			await this.apiKeyService.update(apiKey.id, { lastUsedAt: new Date() })
		}

		return { apiKey, secretToken }
	}
}
