import { BaseStore } from '@langchain/langgraph'
import { DATABASE_POOL_TOKEN, RequestContext } from '@metad/server-core'
import { Inject } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { Pool } from 'pg'
import { CopilotStoreService } from '../../copilot-store.service'
import { CopilotMemoryStore } from '../../store'
import { CopilotStorePutCommand } from '../put.command'

@CommandHandler(CopilotStorePutCommand)
export class CopilotStorePutHandler implements ICommandHandler<CopilotStorePutCommand> {
	constructor(
		private readonly commandBus: CommandBus,
		private readonly service: CopilotStoreService,
		@Inject(DATABASE_POOL_TOKEN) private readonly pgPool: Pool
	) {}

	public async execute(command: CopilotStorePutCommand): Promise<BaseStore> {
		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()
		return new CopilotMemoryStore({
			pgPool: this.pgPool,
			tenantId,
			organizationId,
			userId: null
		})
	}
}
