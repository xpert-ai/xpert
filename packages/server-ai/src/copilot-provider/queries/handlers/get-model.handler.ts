import { CommandBus, IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { IsNull, Not } from 'typeorm'
import { CopilotProviderModelService } from '../../models/copilot-provider-model.service'
import { GetCopilotProviderModelQuery } from '../get-model.query'

@QueryHandler(GetCopilotProviderModelQuery)
export class GetCopilotProviderModelHandler implements IQueryHandler<GetCopilotProviderModelQuery> {
	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		private readonly service: CopilotProviderModelService
	) {}

	public async execute(command: GetCopilotProviderModelQuery) {
		const { modelName, modelType } = command.params ?? {}
		const conditions = {
			providerId: command.providerId,
			modelName: modelName || Not(IsNull())
		}
		if (modelType) {
			conditions['modelType'] = modelType
		}
		const { items } = await this.service.findAllInOrganizationOrTenant({
			where: conditions
		})

		return items
	}
}
