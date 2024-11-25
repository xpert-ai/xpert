import { IQuery } from '@nestjs/cqrs'

/**
 * Query a chat role copilot
 */
export class CopilotGetChatQuery implements IQuery {
	static readonly type = '[Copilot] Get chat'

	constructor(
		public readonly tenantId: string,
		public readonly organizationId: string,
		public readonly relations: string[]
	) {}
}
