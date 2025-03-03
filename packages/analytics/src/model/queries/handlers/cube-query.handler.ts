import { Agent, DataSourceFactory, ISlicer, Semantics, VariableEntryType } from '@metad/ocap-core'
import { Inject, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { firstValueFrom, switchMap } from 'rxjs'
import { SemanticModelCacheService } from '../../cache/cache.service'
import { SemanticModelService } from '../../model.service'
import { NgmDSCoreService, OCAP_AGENT_TOKEN, OCAP_DATASOURCE_TOKEN, registerSemanticModel } from '../../ocap'
import { ModelCubeQuery } from '../cube.query'
import { race } from '@metad/server-common'

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
		const { id, sessionId, modelId, body, forceRefresh, acceptLanguage } = params.input
		const { mdx, query } = body ?? {}
		const user = params.user

		this.logger.verbose(`Executing OLAP query [${id}] for model: ${modelId}`)

		const model = await this.semanticModelService.findOne(modelId, {
			relations: ['dataSource', 'dataSource.type', 'roles', 'roles.users']
		})

		// New Ocap context for every chatbi conversation
		const dsCoreService = new NgmDSCoreService(this.agent, this.dataSourceFactory)

		registerSemanticModel(model, dsCoreService)

		// Make sure
		const cubeSchema = model.options?.schema?.cubes?.find((_) => _.name === query.cube)
		if (cubeSchema) {
			cubeSchema.variables?.filter((_) => !_.visible && _.variableEntryType === VariableEntryType.Required).forEach((_) => {
				let key = null
				if (_.semantics?.semantic) {
					switch(_.semantics.semantic) {
						case (Semantics['Sys.UserEmail']): {
							key = user?.email
							break
						}
						case (Semantics['Sys.UserName']): {
							key = user?.username
							break
						}
						case (Semantics['Sys.UserRole']): {
							key = user?.role?.name
							break
						}
					}
				}

				if (key) {
					query.filters.push({
						dimension: {
							parameter: _.name,
							dimension: _.referenceDimension,
							hierarchy: _.referenceHierarchy
						},
						members: [
							{
								key
							}
						]
					} as ISlicer)
				}
			})
		}

		// Make sure datasource exists
		// const _dataSource = await dsCoreService._getDataSource(modelId)
		// const entity = await firstValueFrom(dsCoreService.selectEntitySet(modelId, query.cube))
		// const entityType = entity.entityType

		const entityService = await firstValueFrom(dsCoreService.getEntityService(modelId, query.cube))
		
		const result = await race(10 * 60 * 1000, firstValueFrom(entityService.selectEntityType().pipe(
			switchMap(() => entityService.selectQuery(query))
		)))

		return {
			data: result
		}

		// // Access controls
		// // const currentUserId = RequestContext.currentUserId()
		// const currentUserId = user?.id
		// const tenantId = user?.tenantId
		// const roleNames = model.roles
		// 	.filter((role) => role.users.find((user) => user.id === currentUserId))
		// 	.map((role) => role.name)

		// // Query
		// //   Cache
		// const language = model.preferences?.language || acceptLanguage
	}
}
