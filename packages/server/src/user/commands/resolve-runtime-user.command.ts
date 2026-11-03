import { Command } from '@nestjs/cqrs'
import type { IUser } from '@xpert-ai/contracts'

/** Revalidate the current human request identity without permitting a scope or actor switch. */
export class ResolveRuntimeUserCommand extends Command<IUser & { id: string; tenantId: string }> {
	constructor(
		readonly tenantId: string,
		readonly userId: string,
		readonly organizationId?: string
	) {
		super()
	}
}
