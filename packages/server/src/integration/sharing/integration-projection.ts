import type { FindOneOptions } from 'typeorm'
import type { Integration } from '../integration.entity'

type IntegrationSelect = FindOneOptions<Integration>['select']
const policyFields = ['tenantId', 'organizationId', 'sharing'] as const

/** Load authorization fields even when consumers request only selector metadata. */
export function selectIntegrationPolicyFields(select: IntegrationSelect): IntegrationSelect {
	if (!select) return select
	return Array.isArray(select)
		? [...new Set([...select, ...policyFields])]
		: { ...select, tenantId: true, organizationId: true, sharing: true }
}

export function projectIntegrationPolicyFields(integration: Integration, select: IntegrationSelect): Integration {
	if (!select) return integration
	const projected = { ...integration }
	for (const field of policyFields) {
		if (Array.isArray(select) ? !select.includes(field) : !select[field]) delete projected[field]
	}
	return projected
}
