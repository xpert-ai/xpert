export const EVENT_FEATURE_ORGANIZATION_UPDATED = 'feature.organization.updated'

export class FeatureOrganizationUpdatedEvent {
	constructor(
		public readonly tenantId: string,
		public readonly organizationId: string | null,
		public readonly featureId: string,
		public readonly featureCode: string,
		public readonly previousIsEnabled: boolean,
		public readonly isEnabled: boolean
	) {}
}
