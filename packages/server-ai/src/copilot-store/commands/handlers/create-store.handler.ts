import { BaseStore } from '@langchain/langgraph'
import { DATABASE_POOL_TOKEN, RequestContext } from '@metad/server-core'
import { Inject } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { Pool } from 'pg'
import { CopilotStoreService } from '../../copilot-store.service'
import { CopilotMemoryStore } from '../../store'
import { CreateCopilotStoreCommand } from '../create-store.command'

@CommandHandler(CreateCopilotStoreCommand)
export class CreateCopilotStoreHandler implements ICommandHandler<CreateCopilotStoreCommand> {
	constructor(
		private readonly commandBus: CommandBus,
		private readonly service: CopilotStoreService,
		@Inject(DATABASE_POOL_TOKEN) private readonly pgPool: Pool
	) {}

	public async execute(command: CreateCopilotStoreCommand): Promise<BaseStore> {
		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()
		return new CopilotMemoryStore({
			pgPool: this.pgPool,
			tenantId,
			organizationId
		})
	}
}
