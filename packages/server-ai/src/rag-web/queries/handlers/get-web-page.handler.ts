import { Document } from '@langchain/core/documents'
import { CACHE_MANAGER, Inject, Logger } from '@nestjs/common'
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { Cache } from 'cache-manager'
import { RagWebLoadCommand } from '../../commands'
import { GetRagWebDocCacheQuery } from '../get-web-page.query'

@QueryHandler(GetRagWebDocCacheQuery)
export class GetRagWebDocCacheHandler implements IQueryHandler<GetRagWebDocCacheQuery> {
	protected logger = new Logger(GetRagWebDocCacheHandler.name)

	constructor(
		private readonly queryBus: QueryBus,
		@Inject(CACHE_MANAGER)
		private readonly cacheManager: Cache
	) {}

	public async execute(command: GetRagWebDocCacheQuery): Promise<Document[]> {
		const { id } = command
		const key = `${RagWebLoadCommand.prefix}:${id}`
		const doc: Document = await this.cacheManager.get(key)
		return doc ? [doc] : []
	}
}
