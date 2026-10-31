// Ownership is not a consumption grant. Missing/malformed sharing policies fail closed.
import { IIntegration, IntegrationUsage, IntegrationUsageScope } from '@xpert-ai/contracts'
import { integrationSharingSchema } from './integration-sharing.schema'

export function canConsumeIntegration(
	integration: Pick<IIntegration, 'tenantId' | 'organizationId' | 'sharing'>,
	scope: IntegrationUsageScope,
	usage: IntegrationUsage
): boolean {
	if (!scope.tenantId || integration.tenantId !== scope.tenantId) return false
	if (integration.organizationId != null)
		return !!scope.organizationId && integration.organizationId === scope.organizationId
	if (!scope.organizationId) return true
	const parsed = integrationSharingSchema.safeParse(integration.sharing)
	if (!parsed.success) return false
	const sharing = parsed.data
	return (
		sharing.usages.includes(usage) &&
		(sharing.visibility === 'all-organizations' ||
			(sharing.visibility === 'selected-organizations' && sharing.organizationIds.includes(scope.organizationId)))
	)
}
