import { Agent, DataSourceFactory } from '@metad/ocap-core'
import { race } from '@metad/server-common'
import { Inject, Logger } from '@nestjs/common'
import { CommandBus, IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { firstValueFrom, switchMap } from 'rxjs'
import { SemanticModelService } from '../../model.service'
import { NgmDSCoreService, OCAP_AGENT_TOKEN, OCAP_DATASOURCE_TOKEN, registerSemanticModel } from '../../ocap'
import { ModelCubeQuery } from '../cube.query'
import { applySemanticModelDraft } from '../../helper'

/**
 * Maximum query waiting time 10 minutes
 */
const QUERY_MAX_WAIT_TIME = 10 * 60 * 1000

@QueryHandler(ModelCubeQuery)
export class ModelCubeQueryHandler implements IQueryHandler<ModelCubeQuery> {
	private readonly logger = new Logger(ModelCubeQueryHandler.name)

	@Inject(OCAP_AGENT_TOKEN)
	private agent: Agent
	@Inject(OCAP_DATASOURCE_TOKEN)
	private dataSourceFactory: { type: string; factory: DataSourceFactory }

	constructor(
		private readonly semanticModelService: SemanticModelService,
		private readonly queryBus: QueryBus,
		private readonly commandBus: CommandBus
	) {}

	async execute(params: ModelCubeQuery) {
		const { id, sessionId, modelId, body, acceptLanguage, forceRefresh, isDraft } = params.input
		const { mdx, query, isDraftIndicators } = body ?? {}

		this.logger.verbose(`Executing OLAP query [${id}] for model: ${modelId}`)

		const model = await this.semanticModelService.findOne4Ocap(modelId, {withIndicators: true})

		// New Ocap context for every chatbi conversation
		const dsCoreService = new NgmDSCoreService(this.agent, this.dataSourceFactory)

		// Indicators to use draft
		if (isDraftIndicators?.length) {
			model.indicators = model.indicators.map((indicator) => {
				if (isDraftIndicators.includes(indicator.code) && indicator.draft) {
					return {
						...indicator,
						...indicator.draft
					}
				}
				return indicator
			})
		}
		registerSemanticModel(isDraft ? {...applySemanticModelDraft(model), isDraft: true} : model, isDraft, dsCoreService, { language: acceptLanguage })

		const entityService = await firstValueFrom(dsCoreService.getEntityService(modelId, query.cube))

		query.calculatedMeasures?.forEach((measure) => {
			entityService.registerMeasure(measure.name, measure)
		})

		// 10 minute query timeout
		const result = await race(
			QUERY_MAX_WAIT_TIME,
			firstValueFrom(entityService.selectEntityType().pipe(switchMap(() => entityService.selectQuery(query))))
		)

		return {
			data: result
		}
	}
}
