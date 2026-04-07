import { IApiKey } from '@metad/contracts'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ApiKey } from '../../api-key.entity'
import { ApiKeyService } from '../../api-key.service'
import { UseApiKeyQuery } from '../api-key.use.query'

@QueryHandler(UseApiKeyQuery)
export class UseApiKeyHandler implements IQueryHandler<UseApiKeyQuery> {
	constructor(
		@InjectRepository(ApiKey) private readonly repository: Repository<ApiKey>,
		private readonly service: ApiKeyService
	) {}

	public async execute(command: UseApiKeyQuery): Promise<IApiKey> {
		const token = command.token

		const apiKey = await this.repository.findOne({
			where: { token: token },
			relations: ['createdBy', 'user']
		})

		await this.service.update(apiKey.id, { lastUsedAt: new Date() })

		return apiKey
	}
}
