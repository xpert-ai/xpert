import { IQuery } from '@nestjs/cqrs'

/**
 * Find an available copilot in order of priority
 */
export class CopilotGetChatQuery implements IQuery {
	static readonly type = '[Copilot] Get chat one'

	constructor(
		public readonly tenantId: string,
		public readonly organizationId: string,
		public readonly relations?: string[]
	) {}
}
