import { AiProviderRole, ICopilot } from '@metad/contracts'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { CopilotGetChatQuery } from '../get-chat-copilot.query'
import { CopilotService } from '../../copilot.service'

@QueryHandler(CopilotGetChatQuery)
export class CopilotGetChatHandler implements IQueryHandler<CopilotGetChatQuery> {
	constructor(
		private readonly service: CopilotService
	) {}

	public async execute(command: CopilotGetChatQuery): Promise<ICopilot> {
		const relations = command.relations

		const copilot = await this.service.findOneByRole(AiProviderRole.Primary, command.tenantId, command.organizationId)

		return copilot
	}
}
