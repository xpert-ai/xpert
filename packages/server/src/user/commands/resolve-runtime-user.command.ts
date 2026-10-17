import { Command } from '@nestjs/cqrs'
import type { IUser } from '@xpert-ai/contracts'

/** Restore a regular authenticated user at a trusted worker boundary using current membership and permissions. */
export class ResolveRuntimeUserCommand extends Command<IUser & { id: string; tenantId: string }> {
	constructor(
		readonly tenantId: string,
		readonly userId: string,
		readonly organizationId?: string
	) {
		super()
	}
}
