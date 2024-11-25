import { Agent, DataSourceFactory } from '@metad/ocap-core'
import { ConfigService } from '@metad/server-config'
import { CACHE_MANAGER, Inject } from '@nestjs/common'
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { Cache } from 'cache-manager'
import { NgmDSCoreService, OCAP_AGENT_TOKEN, OCAP_DATASOURCE_TOKEN } from '../../../model/ocap'
import { GetBIContextQuery } from '../get-bi-context.query'
import { TBIContext } from '../../types'
import { ChatBIModelService } from '../../../chatbi-model'

@QueryHandler(GetBIContextQuery)
export class GetBIContextHandler implements IQueryHandler<GetBIContextQuery> {
	@Inject(ConfigService)
	private readonly configService: ConfigService

	constructor(
		private readonly queryBus: QueryBus,
		@Inject(OCAP_AGENT_TOKEN)
		private agent: Agent,
		@Inject(OCAP_DATASOURCE_TOKEN)
		private dataSourceFactory: { type: string; factory: DataSourceFactory },
		@Inject(CACHE_MANAGER)
		private readonly cacheManager: Cache,

		private readonly modelService: ChatBIModelService,
	) {}

	public async execute(command: GetBIContextQuery): Promise<TBIContext> {
		// New Ocap context for every chatbi conversation
		const dsCoreService = new NgmDSCoreService(this.agent, this.dataSourceFactory)

		return {
			dsCoreService,
			modelService: this.modelService,
			cacheManager: this.cacheManager
		}
	}
}
