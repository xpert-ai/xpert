import { Agent, DataSourceFactory } from '@metad/ocap-core'
import { race } from '@metad/server-common'
import { Inject, Logger } from '@nestjs/common'
import { CommandBus, IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { firstValueFrom, switchMap } from 'rxjs'
import { SemanticModelService } from '../../model.service'
import { NgmDSCoreService, OCAP_AGENT_TOKEN, OCAP_DATASOURCE_TOKEN, registerSemanticModel } from '../../ocap'
import { ModelCubeQuery } from '../cube.query'

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
		const { mdx, query } = body ?? {}

		this.logger.verbose(`Executing OLAP query [${id}] for model: ${modelId}`)

		const model = await this.semanticModelService.findOne(modelId, {
			relations: ['dataSource', 'dataSource.type', 'roles', 'roles.users', 'indicators']
		})

		// New Ocap context for every chatbi conversation
		const dsCoreService = new NgmDSCoreService(this.agent, this.dataSourceFactory)

		registerSemanticModel(isDraft ? {...model, ...(model.draft ?? {}), isDraft: true} : model, isDraft, dsCoreService, { language: acceptLanguage })

		const entityService = await firstValueFrom(dsCoreService.getEntityService(modelId, query.cube))

		query.calculatedMeasures?.forEach((measure) => {
			entityService.registerMeasure(measure.name, measure)
		})

		const result = await race(
			QUERY_MAX_WAIT_TIME,
			firstValueFrom(entityService.selectEntityType().pipe(switchMap(() => entityService.selectQuery(query))))
		)

		return {
			data: result
		}
	}
}
