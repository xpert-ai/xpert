import { BaseStore } from '@langchain/langgraph'
import { mapTranslationLanguage } from '@metad/contracts'
import { RequestContext } from '@metad/server-core'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { I18nService } from 'nestjs-i18n'
import { CreateCopilotStoreCommand } from '../../../copilot-store'
import { CopilotNotFoundException } from '../../../core/errors'
import { GetXpertMemoryEmbeddingsQuery } from '../../queries'
import { CreateMemoryStoreCommand } from '../create-memory-store.command'

@CommandHandler(CreateMemoryStoreCommand)
export class CreateMemoryStoreHandler implements ICommandHandler<CreateMemoryStoreCommand> {
	readonly #logger = new Logger(CreateMemoryStoreHandler.name)

	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		private readonly i18nService: I18nService
	) {}

	public async execute(command: CreateMemoryStoreCommand): Promise<BaseStore | null> {
		const xpert = command.xpert
		const userId = command.userId
		const { tenantId, organizationId } = command.xpert
		const memory = xpert.memory
		// if (!memory?.enabled) {
		// 	return null
		// }

		const embeddings = await this.queryBus.execute(
			new GetXpertMemoryEmbeddingsQuery(tenantId, organizationId, memory, {})
		)

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
					// fields
				}
			})
		)

		return store
	}
}
