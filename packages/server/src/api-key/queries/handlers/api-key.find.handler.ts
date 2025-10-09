import { IApiKey } from '@metad/contracts'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { ApiKeyService } from '../../api-key.service'
import { FindApiKeyQuery } from '../api-key.find.query'

@QueryHandler(FindApiKeyQuery)
export class FindApiKeyHandler implements IQueryHandler<FindApiKeyQuery> {
	constructor(private readonly service: ApiKeyService) {}

	public async execute(command: FindApiKeyQuery): Promise<IApiKey> {
		const token = command.input
		return await this.service.findOneByOptions({ where: { token: token }, relations: ['createdBy']})
	}
}
