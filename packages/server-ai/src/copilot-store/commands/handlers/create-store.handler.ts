import { BaseStore } from '@langchain/langgraph'
import { DATABASE_POOL_TOKEN, RequestContext } from '@metad/server-core'
import { Inject } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { Pool } from 'pg'
import { CopilotMemoryStore } from '../../store'
import { CreateCopilotStoreCommand } from '../create-store.command'

@CommandHandler(CreateCopilotStoreCommand)
export class CreateCopilotStoreHandler implements ICommandHandler<CreateCopilotStoreCommand> {
	constructor(
		private readonly commandBus: CommandBus,
		@Inject(DATABASE_POOL_TOKEN) private readonly pgPool: Pool
	) {}

	public async execute(command: CreateCopilotStoreCommand): Promise<BaseStore> {
		const tenantId = command.options?.tenantId ?? RequestContext.currentTenantId()
		const organizationId = command.options?.organizationId ?? RequestContext.getOrganizationId()
		const userId = command.options?.userId ?? RequestContext.currentUserId()
		const store = new CopilotMemoryStore({
			pgPool: this.pgPool,
			tenantId,
			organizationId,
			userId,
			index: command.options.index
		})
		await store.ensureTableInDatabase()
		return store
	}
}
