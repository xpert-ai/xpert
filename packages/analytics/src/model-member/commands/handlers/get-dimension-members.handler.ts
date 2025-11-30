import {
	Agent,
	DataSourceFactory,
	EntityType,
	getEntityProperty,
	IDimensionMember,
	isEntityType
} from '@metad/ocap-core'
import { RequestContext } from '@metad/server-core'
import { Inject, Logger } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { firstValueFrom } from 'rxjs'
import {
	getSemanticModelKey,
	NgmDSCoreService,
	OCAP_AGENT_TOKEN,
	OCAP_DATASOURCES_TOKEN,
	registerSemanticModel
} from '../../../model/ocap'
import { SemanticModelMemberService } from '../../member.service'
import { GetDimensionMembersCommand } from '../get-dimension-members.command'

@CommandHandler(GetDimensionMembersCommand)
export class GetDimensionMembersHandler implements ICommandHandler<GetDimensionMembersCommand> {
	private logger = new Logger(GetDimensionMembersHandler.name)

	@Inject(OCAP_AGENT_TOKEN)
	private agent: Agent
	@Inject(OCAP_DATASOURCES_TOKEN)
	private dataSourceFactories: { type: string; factory: DataSourceFactory }[]

	constructor(private readonly service: SemanticModelMemberService) {}

	public async execute(
		command: GetDimensionMembersCommand
	): Promise<{ entityType: EntityType; members: IDimensionMember[]; statistics: Record<string, string> }> {
		const { model, cube, dimensions, entityId } = command
		const dsCoreService = new NgmDSCoreService(this.agent, this.dataSourceFactories)

		const language = model.preferences?.language || RequestContext.getLanguageCode()
		const modelKey = getSemanticModelKey(model)
		registerSemanticModel(model, false, dsCoreService, { language })
		const modelDataSource = await firstValueFrom(dsCoreService.getDataSource(modelKey))

		this.logger.debug(`Sync members for dimensions: ${dimensions} in cube: ${cube} of model: ${model.name} ...`)

		const entityType = await firstValueFrom(modelDataSource.selectEntityType(cube))
		if (!isEntityType(entityType)) {
			throw entityType
		}

		this.logger.debug(`Got entity type: ${entityType.name}`)

		const statistics = {}
		let members = []
		for await (const dimension of dimensions) {
			const dimensionProperty = getEntityProperty(entityType, dimension)
			for await (const hierarchy of dimensionProperty.hierarchies) {
				// const hierarchyProperty = getEntityHierarchy(entityType, hierarchy)
				const _members = await firstValueFrom(
					modelDataSource.selectMembers(cube, {
						dimension,
						hierarchy: hierarchy.name
					})
				)

				statistics[hierarchy.name] = _members.length
				members = members.concat(_members.map((item) => ({
					...item,
					memberUniqueName: item.memberUniqueName || `${item.hierarchy}.${item.memberKey}`,
					modelId: model.id,
					entityId,
					cube
				})))
			}
		}

		this.logger.debug(`Got entity members: ${members.length}`)

		return {
			entityType,
			members,
			statistics
		}
	}
}
