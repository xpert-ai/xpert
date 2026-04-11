export const EVENT_USER_ORGANIZATION_DELETED = 'user.organization.deleted'

export class UserOrganizationDeletedEvent {
	constructor(
		public readonly tenantId: string,
		public readonly organizationId: string,
		public readonly userId: string
	) {}
}
