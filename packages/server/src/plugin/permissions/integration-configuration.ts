// Invariants: configuration reads use the host-bound plugin scope, never request headers.
// Keep legacy runtime reads unchanged for multi-tenant callback plugins.
import { IntegrationUsage, IntegrationUsageScope, IIntegration } from '@xpert-ai/contracts'
import {
	GLOBAL_ORGANIZATION_SCOPE,
	SYSTEM_GLOBAL_SCOPE,
	getDefaultTenantId,
	type Permissions
} from '@xpert-ai/plugin-sdk'
import { In, IsNull, type FindOptionsWhere, type Repository } from 'typeorm'
import { canConsumeIntegration } from '../../integration/sharing/integration-sharing.policy'
import { Integration } from '../../integration/integration.entity'
import type { PluginIntegrationPermissionService } from './integration-permission'

export interface PluginPermissionScope {
	tenantId?: string | null
	organizationId?: string | null
	scopeKey?: string | null
}

export function bindIntegrationConfigurationReader(
	service: PluginIntegrationPermissionService,
	permissions: Permissions,
	scope?: PluginPermissionScope
) {
	const boundScope = { ...scope }
	const grants = permissions
		.filter((permission) => permission.type === 'integration')
		.filter((permission) => !permission.operations?.length || permission.operations.includes('read'))
		.map((permission) => ({
			service: permission.service,
			scope: permission.scope ? [...permission.scope] : undefined
		}))
	const readConfiguration = (id: string) =>
		service.readConfiguration(
			id,
			boundScope,
			grants.filter((grant) => !grant.scope?.length || grant.scope.includes(id)).map((grant) => grant.service)
		)
	return new Proxy(service, {
		get(target, property) {
			if (property === 'readConfiguration') return readConfiguration
			if (property === 'readForUsage')
				return async (id: string, usage: IntegrationUsage, usageScope: IntegrationUsageScope) => {
					const allowed = grants.filter((grant) => !grant.scope?.length || grant.scope.includes(id))
					if (!allowed.length) return null
					const integration = await service.readForUsage(id, usage, usageScope)
					return integration &&
						allowed.some((grant) => grant.service === '*' || grant.service === integration.provider)
						? integration
						: null
				}
			const value = Reflect.get(target, property)
			return typeof value === 'function' ? value.bind(target) : value
		}
	})
}

export async function readIntegrationConfiguration(
	repository: Pick<Repository<Integration>, 'findOne'>,
	id: string,
	scope: PluginPermissionScope | undefined,
	providers: readonly string[]
): Promise<IIntegration | null> {
	const system = scope?.scopeKey === SYSTEM_GLOBAL_SCOPE
	const tenantId = system ? getDefaultTenantId() : scope?.tenantId
	if (typeof id !== 'string' || !id || !tenantId || !providers.length) return null
	const organizationId = !system && scope?.organizationId !== GLOBAL_ORGANIZATION_SCOPE ? scope?.organizationId : null
	const tenant: FindOptionsWhere<Integration> = {
		id,
		tenantId,
		organizationId: IsNull(),
		...(providers.includes('*') ? {} : { provider: In([...providers]) })
	}
	const integration = await repository.findOne({
		where: organizationId ? [tenant, { ...tenant, organizationId }] : [tenant]
	})
	if (
		!integration ||
		integration.id !== id ||
		integration.tenantId !== tenantId ||
		(integration.organizationId != null && integration.organizationId !== organizationId) ||
		(!providers.includes('*') && !providers.includes(integration.provider))
	)
		return null
	return canConsumeIntegration(integration, { tenantId, organizationId: organizationId ?? null }, 'configuration')
		? integration
		: null
}
