import { AiProviderRole } from '@metad/contracts'
import { IQuery } from '@nestjs/cqrs'

/**
 * Query a single copilot by tenantId and copilot role.
 * The tenantId parameter is required as the program might be running in the background.
 */
export class CopilotOneByRoleQuery implements IQuery {
	static readonly type = '[Copilot] Get One by role'

	constructor(
		public readonly tenantId: string,
		public readonly organizationId: string,
		public readonly role: AiProviderRole,
		public readonly relations?: string[]
	) {}
}
