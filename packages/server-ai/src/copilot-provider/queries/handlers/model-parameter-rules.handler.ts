import { NotFoundException } from '@nestjs/common'
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { AIProvidersService } from '../../../ai-model'
import { CopilotProviderService } from '../../copilot-provider.service'
import { CopilotProviderModelService } from '../../models/copilot-provider-model.service'
import { CopilotProviderModelParameterRulesQuery } from '../model-parameter-rules.query'

@QueryHandler(CopilotProviderModelParameterRulesQuery)
export class CopilotProviderModelParameterRulesHandler
	implements IQueryHandler<CopilotProviderModelParameterRulesQuery>
{
	constructor(
		private readonly service: CopilotProviderService,
		private readonly modelService: CopilotProviderModelService,
		private readonly providersService: AIProvidersService,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: CopilotProviderModelParameterRulesQuery): Promise<any[]> {
		const { providerId, modelType, model } = command

		const copilotProvider = await this.service.findOneInOrganizationOrTenant(providerId)
		if (!copilotProvider) {
			throw new NotFoundException(`Copilot provider ${providerId} is not found.`)
		}

		const customModel = await this.modelService.findOneOrFailByWhereOptions({
			providerId, modelType, modelName: model
		})

		const modelProvider = this.providersService.getProvider(copilotProvider.providerName, true)

		return modelProvider.getModelManager(modelType)?.getParameterRules(model, customModel.record?.modelProperties)
	}
}
