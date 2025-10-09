import { IApiKey } from '@metad/contracts'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { ApiKeyService } from '../../api-key.service'
import { UseApiKeyQuery } from '../api-key.use.query'

@QueryHandler(UseApiKeyQuery)
export class UseApiKeyHandler implements IQueryHandler<UseApiKeyQuery> {
	constructor(private readonly service: ApiKeyService) {}

	public async execute(command: UseApiKeyQuery): Promise<IApiKey> {
		const token = command.token

		const apiKey = await this.service.findOneByOptions({ where: { token: token }, relations: ['createdBy'] })

		await this.service.update(apiKey.id, { lastUsedAt: new Date() })

		return apiKey
	}
}
