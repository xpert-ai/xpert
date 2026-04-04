export const EVENT_USER_ORGANIZATION_CREATED = 'user.organization.created'

export class UserOrganizationCreatedEvent {
	constructor(
		public readonly tenantId: string,
		public readonly organizationId: string,
		public readonly userId: string
	) {}
}
