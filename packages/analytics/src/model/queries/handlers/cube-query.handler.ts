import { Agent, DataSourceFactory, ISlicer, Semantics, VariableEntryType } from '@metad/ocap-core'
import { race } from '@metad/server-common'
import { Inject, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { firstValueFrom, switchMap } from 'rxjs'
import { SemanticModelCacheService } from '../../cache/cache.service'
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
		private configService: ConfigService,
		private readonly semanticModelService: SemanticModelService,
		private readonly cacheService: SemanticModelCacheService,
		private readonly queryBus: QueryBus
	) {}

	async execute(params: ModelCubeQuery) {
		const { id, sessionId, modelId, body, acceptLanguage } = params.input
		const { mdx, query } = body ?? {}
		const user = params.user

		this.logger.verbose(`Executing OLAP query [${id}] for model: ${modelId}`)

		const model = await this.semanticModelService.findOne(modelId, {
			relations: ['dataSource', 'dataSource.type', 'roles', 'roles.users', 'indicators']
		})

		// New Ocap context for every chatbi conversation
		const dsCoreService = new NgmDSCoreService(this.agent, this.dataSourceFactory)

		registerSemanticModel(model, dsCoreService, { language: acceptLanguage })

		// // Make sure
		// const cubeSchema = model.options?.schema?.cubes?.find((_) => _.name === query.cube)
		// if (cubeSchema) {
		// 	cubeSchema.variables
		// 		?.filter((_) => !_.visible && _.variableEntryType === VariableEntryType.Required)
		// 		.forEach((_) => {
		// 			let key = null
		// 			if (_.semantics?.semantic) {
		// 				switch (_.semantics.semantic) {
		// 					case Semantics['Sys.UserEmail']: {
		// 						key = user?.email
		// 						break
		// 					}
		// 					case Semantics['Sys.UserName']: {
		// 						key = user?.username
		// 						break
		// 					}
		// 					case Semantics['Sys.UserRole']: {
		// 						key = user?.role?.name
		// 						break
		// 					}
		// 					case Semantics['Sys.UserID']: {
		// 						key = user?.id
		// 						break
		// 					}
		// 					case Semantics['Sys.UserThirdPartyId']: {
		// 						key = user?.thirdPartyId
		// 						break
		// 					}
		// 				}
		// 			}

		// 			if (key) {
		// 				query.filters.push({
		// 					dimension: {
		// 						parameter: _.name,
		// 						dimension: _.referenceDimension,
		// 						hierarchy: _.referenceHierarchy
		// 					},
		// 					members: [
		// 						{
		// 							key
		// 						}
		// 					]
		// 				} as ISlicer)
		// 			}
		// 		})
		// }

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
