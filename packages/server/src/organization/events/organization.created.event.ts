export const EVENT_ORGANIZATION_CREATED = 'organization.created'

export class OrganizationCreatedEvent {
	constructor(
		public readonly tenantId: string,
		public readonly organizationId: string,
		public readonly ownerUserId?: string | null
	) {}
}
