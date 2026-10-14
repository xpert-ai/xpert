import { ApiKeyBindingType, IApiKey } from '@xpert-ai/contracts'
import { UnauthorizedException } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Not, Or, Repository } from 'typeorm'
import { ApiKey } from '../../api-key.entity'
import { ApiKeyService } from '../../api-key.service'
import { UseApiKeyQuery } from '../api-key.use.query'
import { hashPersonalApiKey, PERSONAL_API_KEY_PREFIX } from '../../personal-api-key/personal-api-key-token'

@QueryHandler(UseApiKeyQuery)
export class UseApiKeyHandler implements IQueryHandler<UseApiKeyQuery> {
	constructor(
		@InjectRepository(ApiKey) private readonly repository: Repository<ApiKey>,
		private readonly service: ApiKeyService
	) {}

	public async execute(command: UseApiKeyQuery): Promise<IApiKey> {
		const token = command.token
		const personal = token.startsWith(PERSONAL_API_KEY_PREFIX)
		if (personal && !/^sk-user-[A-Za-z0-9_-]{43}$/.test(token)) throw new UnauthorizedException()

		const apiKey = await this.repository.findOne({
			where: {
				token: personal ? hashPersonalApiKey(token) : token,
				type: personal ? ApiKeyBindingType.USER : Or(IsNull(), Not(ApiKeyBindingType.USER)),
				revokedAt: IsNull()
			},
			relations: personal
				? ['user', 'user.role', 'user.role.rolePermissions', 'user.employee']
				: ['createdBy', 'user']
		})

		if (!apiKey) {
			throw new UnauthorizedException()
		}

		if (personal) this.service.resolvePersonalUser(apiKey)
		await this.service.recordUse(apiKey)

		return apiKey
	}
}
