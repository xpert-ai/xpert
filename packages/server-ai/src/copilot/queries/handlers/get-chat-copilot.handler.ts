import { AiProviderRole, ICopilot } from '@metad/contracts'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { CopilotGetChatQuery } from '../get-chat-copilot.query'
import { CopilotService } from '../../copilot.service'
import { CopilotNotFoundException } from '../../../core'

@QueryHandler(CopilotGetChatQuery)
export class CopilotGetChatHandler implements IQueryHandler<CopilotGetChatQuery> {
	constructor(
		private readonly service: CopilotService
	) {}

	public async execute(command: CopilotGetChatQuery): Promise<ICopilot> {
		const copilots = await this.service.findAllAvailablesCopilots(command.tenantId, command.organizationId)
		for (const role of [AiProviderRole.Primary, AiProviderRole.Secondary, AiProviderRole.Reasoning]) {
			const copilot = copilots.find((_) => _.role === role)
			if (copilot) {
				return copilot
			}
		}

		throw new CopilotNotFoundException(`Unable to find an available Copilot`)
	}
}
