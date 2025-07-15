import { Injectable, UnauthorizedException } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { PassportStrategy } from '@nestjs/passport'
import { IncomingMessage } from 'http'
import { Strategy } from 'passport'
import { UseApiKeyQuery } from '../../api-key'

@Injectable()
export class ApiKeyStrategy extends PassportStrategy(Strategy, 'api-key') {
	constructor(private readonly queryBus: QueryBus) {
		super()
	}

	authenticate(req: IncomingMessage, options: { session: boolean }) {
		const authHeader = req.headers['authorization']
		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			return this.fail(new UnauthorizedException('Authorization header not provided or invalid'))
		}

		const token = authHeader.split(' ')[1]
		this.validateToken(token)
			.then((apiKey) => {
				if (!apiKey.createdBy) {
					return this.fail(new UnauthorizedException('Invalid token'))
				}
				req.headers['organization-id'] = apiKey.organizationId
				this.success({...apiKey.createdBy, apiKey})
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
