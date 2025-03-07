import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { GetDimensionMembersCommand } from '../get-dimension-members.command'
import { SemanticModelMemberService } from '../../member.service'
import { Inject, Logger } from '@nestjs/common'
import { getSemanticModelKey, NgmDSCoreService, OCAP_AGENT_TOKEN, OCAP_DATASOURCE_TOKEN, registerSemanticModel } from '../../../model/ocap'
import { Agent, DataSourceFactory, EntityType, getEntityHierarchy, IDimensionMember, isEntityType } from '@metad/ocap-core'
import { firstValueFrom } from 'rxjs'
import { RequestContext } from '@metad/server-core'

@CommandHandler(GetDimensionMembersCommand)
export class GetDimensionMembersHandler implements ICommandHandler<GetDimensionMembersCommand> {
	private logger = new Logger(GetDimensionMembersHandler.name)

	@Inject(OCAP_AGENT_TOKEN)
	private agent: Agent
	@Inject(OCAP_DATASOURCE_TOKEN)
	private dataSourceFactory: { type: string; factory: DataSourceFactory }

	constructor(private readonly service: SemanticModelMemberService) {}

	public async execute(command: GetDimensionMembersCommand): Promise<{entityType: EntityType; members: IDimensionMember[]; statistics: Record<string, string>}> {
		const { model, cube, hierarchies, entityId } = command
		const dsCoreService = new NgmDSCoreService(this.agent, this.dataSourceFactory)

		const language = model.preferences?.language || RequestContext.getLanguageCode()
		const modelKey = getSemanticModelKey(model)
		registerSemanticModel(model, dsCoreService, { language })
		const modelDataSource = await dsCoreService._getDataSource(modelKey)

		this.logger.debug(`Sync members for dimensions: ${hierarchies} in cube: ${cube} of model: ${model.name} ...`)

		const entityType = await firstValueFrom(modelDataSource.selectEntityType(cube))
		if (!isEntityType(entityType)) {
			throw entityType
		}

		this.logger.debug(`Got entity type: ${entityType.name}`)

		const statistics = {}
		let members = []
		for (const hierarchy of hierarchies) {
			const hierarchyProperty = getEntityHierarchy(entityType, hierarchy)
			const _members = await firstValueFrom(
				modelDataSource.selectMembers(cube, {
					dimension: hierarchyProperty.dimension,
					hierarchy: hierarchyProperty.name
				})
			)

			statistics[hierarchy] = _members.length
			members = members.concat(_members.map((item) => ({ ...item, modelId: model.id, entityId, cube })))
		}

		this.logger.debug(`Got entity members: ${members.length}`)

		return {
			entityType,
			members,
			statistics
		}
	}
}
