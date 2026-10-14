import { Injectable, UnauthorizedException } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { PassportStrategy } from '@nestjs/passport'
import { IncomingMessage } from 'http'
import { Strategy } from 'passport'
import { ApiKeyBindingType } from '@xpert-ai/contracts'
import {
	applyRequestedOrganizationScopeHeaders,
	resolveApiKeyRequestedOrganizationId,
	resolveApiKeyRequestedUserId
} from './api-key-principal'
import { ApiKeyService } from './api-key.service'
import { UseApiKeyQuery } from './queries'
import { PERSONAL_API_KEY_PREFIX } from './personal-api-key/personal-api-key-token'

@Injectable()
export class ApiKeyStrategy extends PassportStrategy(Strategy, 'api-key') {
	constructor(
		private readonly queryBus: QueryBus,
		private readonly apiKeyService: ApiKeyService
	) {
		super()
	}

	validate(...args: any[]): unknown {
		throw new Error('Method not implemented.')
	}

	authenticate(req: IncomingMessage, options?: { session?: boolean; personalOnly?: boolean }) {
		let token = req.headers['x-api-key']
		if (!token) {
			const authHeader = req.headers['authorization']
			if (!authHeader || !authHeader.startsWith('Bearer ')) {
				return this.fail(new UnauthorizedException('Authorization header not provided or invalid'))
			}

			token = authHeader.split(' ')[1]
		}
		if (
			typeof token !== 'string' ||
			!token ||
			(options?.personalOnly && !token.startsWith(PERSONAL_API_KEY_PREFIX))
		) {
			return this.fail(401)
		}

		const requestedUserId = resolveApiKeyRequestedUserId(req)
		const requestedOrganizationId = resolveApiKeyRequestedOrganizationId(req)

		this.validateToken(token)
			.then(async (apiKey) => {
				if (apiKey.type === ApiKeyBindingType.USER) {
					// Keep the requested organization while restoring the fixed human owner.
					return this.success(this.apiKeyService.resolvePersonalUser(apiKey, requestedUserId))
				}
				if (options?.personalOnly) return this.fail(401)
				if (!apiKey.createdBy) {
					return this.fail(new UnauthorizedException('Invalid token'))
				}

				const principal = await this.apiKeyService.resolvePrincipal(apiKey, {
					requestedUserId,
					requestedOrganizationId
				})
				applyRequestedOrganizationScopeHeaders(req, principal?.requestedOrganizationId)
				this.success(principal)
			})
			.catch((err) => {
				// console.error(err)
				return this.error(new UnauthorizedException('Unauthorized', err.message))
			})
	}

	async validateToken(token: string) {
		return await this.queryBus.execute(new UseApiKeyQuery(token))
	}
}
