import { CommandBus, IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { AIModelGetProviderQuery, ModelProvider } from '../../../ai-model'
import { CopilotProviderService } from '../../copilot-provider.service'
import { GetAiProviderCredentialsQuery } from '../get-credentials.query'

@QueryHandler(GetAiProviderCredentialsQuery)
export class GetAiProviderCredentialsHandler implements IQueryHandler<GetAiProviderCredentialsQuery> {
	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		private readonly service: CopilotProviderService
	) {}

	public async execute(command: GetAiProviderCredentialsQuery) {
		const copilotProvider = command.provider

		const modelProvider = await this.queryBus.execute<AIModelGetProviderQuery, ModelProvider>(
			new AIModelGetProviderQuery(copilotProvider.providerName)
		)

		return {
			baseURL: modelProvider.getBaseUrl(copilotProvider.credentials),
			authorization: modelProvider.getAuthorization(copilotProvider.credentials)
		}
	}
}
