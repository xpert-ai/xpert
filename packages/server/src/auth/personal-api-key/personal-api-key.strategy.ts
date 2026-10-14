import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { API_PRINCIPAL_USER_ID_HEADER } from '@xpert-ai/contracts'
import { IncomingMessage } from 'node:http'
import { Strategy } from 'passport'
import { PERSONAL_API_KEY_PREFIX, PersonalApiKeyService } from './personal-api-key.service'

@Injectable()
export class PersonalApiKeyStrategy extends PassportStrategy(Strategy, 'personal-api-key') {
	constructor(private readonly keys: PersonalApiKeyService) {
		super()
	}

	validate(token: string) {
		return this.keys.authenticate(token)
	}

	authenticate(req: IncomingMessage) {
		const authorization = req.headers.authorization
		const token = req.headers['x-api-key'] ?? (authorization?.startsWith('Bearer ') ? authorization.slice(7) : null)
		if (typeof token !== 'string' || !token.startsWith(PERSONAL_API_KEY_PREFIX)) {
			return this.fail(401)
		}
		void this.validate(token)
			.then((user) => {
				const requestedUser = req.headers[API_PRINCIPAL_USER_ID_HEADER]
				if (requestedUser !== undefined && requestedUser !== user.id) {
					return this.error(new UnauthorizedException())
				}
				this.success(user)
			})
			.catch(() => this.error(new UnauthorizedException()))
	}
}
