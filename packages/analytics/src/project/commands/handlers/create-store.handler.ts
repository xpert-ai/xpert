import { Embeddings } from '@langchain/core/embeddings'
import { BaseStore } from '@langchain/langgraph'
import { AiProviderRole, mapTranslationLanguage } from '@metad/contracts'
import {
	CopilotMemoryStore,
	CopilotModelGetEmbeddingsQuery,
	CopilotNotFoundException,
	CopilotOneByRoleQuery,
	CreateCopilotStoreCommand
} from '@metad/server-ai'
import { RequestContext } from '@metad/server-core'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { I18nService } from 'nestjs-i18n'
import { CreateProjectStoreCommand } from '../create-store.command'

@CommandHandler(CreateProjectStoreCommand)
export class CreateProjectStoreHandler implements ICommandHandler<CreateProjectStoreCommand> {
	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		private readonly i18nService: I18nService
	) {}

	public async execute(command: CreateProjectStoreCommand): Promise<BaseStore> {
		const tenantId = command.options?.tenantId ?? RequestContext.currentTenantId()
		const organizationId = command.options?.organizationId ?? RequestContext.getOrganizationId()

		const copilot = await this.queryBus.execute(
			new CopilotOneByRoleQuery(tenantId, organizationId, AiProviderRole.Embedding, [
				'copilotModel',
				'modelProvider'
			])
		)
		if (!copilot?.enabled) {
			throw new CopilotNotFoundException(
				await this.i18nService.t('xpert.Error.EmbeddingCopilotNotFound', {
					lang: mapTranslationLanguage(RequestContext.getLanguageCode())
				})
			)
		}
		const abortController = new AbortController()
		const copilotModel = copilot.copilotModel
		let embeddings = null
		if (copilotModel && copilot?.modelProvider) {
			embeddings = await this.queryBus.execute<CopilotModelGetEmbeddingsQuery, Embeddings>(
				new CopilotModelGetEmbeddingsQuery(copilot, copilotModel, {
					abortController,
					tokenCallback: (tokens: number) => {
						//
					}
				})
			)
		}

		const store = await this.commandBus.execute<CreateCopilotStoreCommand, CopilotMemoryStore>(
			new CreateCopilotStoreCommand({
				index: {
					dims: null,
					embeddings,
					fields: [],
					...(command.options?.index ?? {})
				}
			})
		)

		return store
	}
}
