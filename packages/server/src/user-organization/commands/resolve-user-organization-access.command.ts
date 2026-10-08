import { Command } from '@nestjs/cqrs'
import type { IUser } from '@xpert-ai/contracts'

export type UserOrganizationAccessScope = {
	/** Tenant established by trusted authentication or persisted execution context. */
	tenantId: string
	/** Explicit target organization within that tenant; never inferred from a default. */
	organizationId: string
	/** Human user whose current access is being evaluated. */
	userId: string
}

/**
 * Resolves a human user's current organization access through a single, read-only CQRS entry point.
 * Business modules use CommandBus instead of duplicating membership queries or SUPER_ADMIN exceptions.
 *
 * Use when an authenticated operation must verify organization access, or when a background execution
 * or grant renewal must revalidate a previously authorized user. Callers must already have a trusted
 * tenant / organization / user scope; a request-body identity or a stale role snapshot is not sufficient.
 *
 * Authentication and action / resource authorization remain the caller's responsibility.
 */
export class ResolveUserOrganizationAccessCommand extends Command<IUser | null> {
	static readonly type = '[UserOrganization] Resolve access'

	constructor(public readonly input: UserOrganizationAccessScope) {
		super()
	}
}
