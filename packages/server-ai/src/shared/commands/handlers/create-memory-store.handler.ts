import { Embeddings } from '@langchain/core/embeddings'
import { BaseStore } from '@langchain/langgraph-checkpoint'
import { AiProviderRole, ICopilot, mapTranslationLanguage } from '@metad/contracts'
import { RequestContext } from '@metad/server-core'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { I18nService } from 'nestjs-i18n'
import { CopilotGetOneQuery, CopilotOneByRoleQuery } from '../../../copilot'
import { CopilotModelGetEmbeddingsQuery } from '../../../copilot-model'
import { CreateCopilotStoreCommand } from '../../../copilot-store'
import { CopilotNotFoundException } from '../../../core'
import { CreateMemoryStoreCommand } from '../create-memory-store.command'

@CommandHandler(CreateMemoryStoreCommand)
export class CreateMemoryStoreHandler implements ICommandHandler<CreateMemoryStoreCommand> {
	readonly #logger = new Logger(CreateMemoryStoreHandler.name)

	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		private readonly i18nService: I18nService
	) {}

	public async execute(command: CreateMemoryStoreCommand) {
		const { tenantId, organizationId, copilotModel } = command
		const userId = RequestContext.currentUserId()
		let copilot: ICopilot = null
		if (copilotModel?.copilotId) {
			copilot = await this.queryBus.execute(
				new CopilotGetOneQuery(tenantId, copilotModel.copilotId, ['copilotModel', 'modelProvider'])
			)
		} else {
			copilot = await this.queryBus.execute(
				new CopilotOneByRoleQuery(tenantId, organizationId, AiProviderRole.Embedding, [
					'copilotModel',
					'modelProvider'
				])
			)
		}

		// Embedding model is optional for memory store
		if (!copilot?.enabled) {
			this.#logger.debug('Embedding model not configured for memory store, memory will be disabled')
			return null
		}

		let embeddings = null
		const _copilotModel = copilotModel ?? copilot.copilotModel
		if (_copilotModel && copilot?.modelProvider) {
			embeddings = await this.queryBus.execute<CopilotModelGetEmbeddingsQuery, Embeddings>(
				new CopilotModelGetEmbeddingsQuery(copilot, _copilotModel, command.options)
			)
		}

		// Embedding model is optional for memory store
		if (!embeddings) {
			this.#logger.debug('Embedding model not configured for memory store, memory will be disabled')
			return null
		}

		const store = await this.commandBus.execute<CreateCopilotStoreCommand, BaseStore>(
			new CreateCopilotStoreCommand({
				tenantId,
				organizationId,
				userId,
				index: {
					dims: null,
					embeddings
				}
			})
		)

		return store
	}
}
