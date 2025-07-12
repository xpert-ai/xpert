import { OrderTypeEnum } from '@metad/contracts'
import { Agent, DataSourceFactory } from '@metad/ocap-core'
import { ConfigService } from '@metad/server-config'
import { CACHE_MANAGER, Inject } from '@nestjs/common'
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { Cache } from 'cache-manager'
import { In } from 'typeorm'
import { ChatBIModelService } from '../../../chatbi-model'
import { SemanticModelService } from '../../../model'
import { NgmDSCoreService, OCAP_AGENT_TOKEN, OCAP_DATASOURCE_TOKEN, registerSemanticModel } from '../../../model/ocap'
import { TBIContext } from '../../types'
import { GetBIContextQuery } from '../get-bi-context.query'

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
		private readonly semanticModelService: SemanticModelService
	) {}

	public async execute(command: GetBIContextQuery): Promise<TBIContext> {
		const modelIds = command.models
		// New Ocap context for every chatbi conversation
		const dsCoreService = new NgmDSCoreService(this.agent, this.dataSourceFactory)

		const result = {
			dsCoreService,
			modelService: this.modelService,
			cacheManager: this.cacheManager
		} as TBIContext

		if (modelIds?.length) {
			const { items } = await this.semanticModelService.findAll({
				where: { id: In(modelIds) },
				relations: ['dataSource', 'dataSource.type', 'roles', 'indicators'],
				order: {
					updatedAt: OrderTypeEnum.DESC
				}
			})

			// Register all semantic models
			items.forEach((item) => registerSemanticModel(item, false, dsCoreService))

			result.models = items
		}

		return result
	}
}
