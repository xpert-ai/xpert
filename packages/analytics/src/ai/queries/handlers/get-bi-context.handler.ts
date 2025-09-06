import { OrderTypeEnum } from '@metad/contracts'
import { Agent, DataSourceFactory, Indicator } from '@metad/ocap-core'
import { ConfigService } from '@metad/server-config'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject } from '@nestjs/common'
import { CommandBus, IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { Cache } from 'cache-manager'
import { In } from 'typeorm'
import { ChatBIModelService } from '../../../chatbi-model'
import { SemanticModelService } from '../../../model'
import { NgmDSCoreService, OCAP_AGENT_TOKEN, OCAP_DATASOURCE_TOKEN, registerSemanticModel } from '../../../model/ocap'
import { TBIContext } from '../../types'
import { GetBIContextQuery } from '../get-bi-context.query'
import { IndicatorService } from '../../../indicator'
import { RequestContext } from '@metad/server-core'

@QueryHandler(GetBIContextQuery)
export class GetBIContextHandler implements IQueryHandler<GetBIContextQuery> {
	@Inject(ConfigService)
	private readonly configService: ConfigService

	constructor(
		private readonly queryBus: QueryBus,
		private readonly commandBus: CommandBus,
		@Inject(OCAP_AGENT_TOKEN)
		private agent: Agent,
		@Inject(OCAP_DATASOURCE_TOKEN)
		private dataSourceFactory: { type: string; factory: DataSourceFactory },
		@Inject(CACHE_MANAGER)
		private readonly cacheManager: Cache,

		private readonly modelService: ChatBIModelService,
		private readonly semanticModelService: SemanticModelService,
		private readonly indicatorService: IndicatorService,
	) {}

	public async execute(command: GetBIContextQuery): Promise<TBIContext> {
		const modelIds = command.models
		const { indicatorDraft, semanticModelDraft } = command.params || {}
		// New Ocap context for every chatbi conversation
		const dsCoreService = new NgmDSCoreService(this.agent, this.dataSourceFactory)

		const result = {
			tenantId: RequestContext.currentTenantId(),
			organizationId: RequestContext.getOrganizationId(),
			queryBus: this.queryBus,
			commandBus: this.commandBus,
			dsCoreService,
			modelService: this.modelService,
			semanticModelService: this.semanticModelService,
			indicatorService: this.indicatorService,
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

			if (indicatorDraft) {
				// Convert indicators (draft) to Indicator (ocap) type
				items.forEach((model) => {
					model.indicators = model.indicators.map((_) => {
						return (
							_.draft
								? {
										..._,
										..._.draft,
										...(_.draft.options ?? {})
									}
								: {
										..._,
										...(_.options ?? {})
									}
						) as Indicator
					})
				})
			}

			// Register all semantic models
			items.forEach((item) => registerSemanticModel(item, semanticModelDraft ?? false, dsCoreService))

			result.models = items
		}

		return result
	}
}
