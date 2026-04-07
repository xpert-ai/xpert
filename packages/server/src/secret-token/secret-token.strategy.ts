import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { IncomingMessage } from 'http'
import { Strategy } from 'passport'
import { ApiKeyService } from '../api-key/api-key.service'
import {
	applyTenantScopeHeaders,
	resolveApiKeyRequestedOrganizationId,
} from '../api-key/api-key-principal'
import { SecretTokenService } from './secret-token.service'

/**
 * The secretToken belongs to the user, but apiKey belongs to system.
 */
@Injectable()
export class SecretTokenStrategy extends PassportStrategy(Strategy, 'client-secret') {
	constructor(
		private readonly secretTokenService: SecretTokenService,
		private readonly apiKeyService: ApiKeyService
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
				if (!secretToken?.createdById) {
					return this.fail(new UnauthorizedException('Invalid token'))
				}

				applyTenantScopeHeaders(req)
				this.success(
					await this.apiKeyService.resolvePrincipal(apiKey || secretToken, {
						requestedUserId: secretToken.createdById,
						requestedOrganizationId,
						principalType: 'client_secret'
					})
				)
			})
			.catch((err) => {
				return this.error(new UnauthorizedException('Unauthorized', err.message))
			})
	}

	private async validateToken(token: string) {
		const secretToken = await this.secretTokenService.findOneByOptions({
			where: { token },
			order: { createdAt: 'DESC' }
		})

		if (!secretToken?.validUntil || secretToken.validUntil <= new Date() || secretToken.expired) {
			throw new UnauthorizedException('Token expired')
		}

		const {record: apiKey} = await this.apiKeyService.findOneOrFailByIdString(secretToken.entityId, {
			relations: ['createdBy', 'user']
		})
		if (apiKey) {
			if (apiKey.validUntil && apiKey.validUntil <= new Date()) {
				throw new UnauthorizedException('ApiKey expired')
			}
			await this.apiKeyService.update(apiKey.id, { lastUsedAt: new Date() })
		}

		return {apiKey, secretToken}
	}
}
