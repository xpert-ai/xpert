import { Injectable, UnauthorizedException } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { PassportStrategy } from '@nestjs/passport'
import { IncomingMessage } from 'http'
import { Strategy } from 'passport'
import {
	applyRequestedOrganizationScopeHeaders,
	resolveApiKeyRequestedOrganizationId,
	resolveApiKeyRequestedUserId
} from './api-key-principal'
import { ApiKeyService } from './api-key.service'
import { UseApiKeyQuery } from './queries'

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

	authenticate(req: IncomingMessage, options: { session: boolean }) {
		let token = req.headers['x-api-key'] as string
		if (!token) {
			const authHeader = req.headers['authorization']
			if (!authHeader || !authHeader.startsWith('Bearer ')) {
				return this.fail(new UnauthorizedException('Authorization header not provided or invalid'))
			}

			token = authHeader.split(' ')[1]
		}

		const requestedUserId = resolveApiKeyRequestedUserId(req)
		const requestedOrganizationId = resolveApiKeyRequestedOrganizationId(req)

		this.validateToken(token)
			.then(async (apiKey) => {
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
