import {
	createOperationGuardedPermissionService,
	PluginServicePermissionHandler,
	registerPluginServicePermissionHandler,
	resolvePermissionOperations
} from '@metad/server-core'
import {
	ANALYTICS_PERMISSION_SERVICE_TOKEN,
	AnalyticsPermissionOperation,
	AnalyticsPermissionService,
	Permissions
} from '@xpert-ai/plugin-sdk'

const ANALYTICS_ALL_OPERATIONS = ['dscore', 'query', 'model', 'indicator', 'create_indicator'] as const

function resolveAnalyticsOperations(permissions: Permissions): Set<AnalyticsPermissionOperation> {
	return resolvePermissionOperations<AnalyticsPermissionOperation>(
		permissions,
		'analytics',
		ANALYTICS_ALL_OPERATIONS,
		(operation): operation is AnalyticsPermissionOperation =>
			operation === 'dscore' ||
			operation === 'query' ||
			operation === 'model' ||
			operation === 'indicator' ||
			operation === 'create_indicator'
	)
}

function createGuardedAnalyticsPermissionService(
	pluginName: string,
	service: AnalyticsPermissionService,
	permissions: Permissions
): AnalyticsPermissionService {
	return createOperationGuardedPermissionService<AnalyticsPermissionOperation, AnalyticsPermissionService>(
		pluginName,
		'analytics',
		service,
		permissions,
		resolveAnalyticsOperations
	)
}

const ANALYTICS_PLUGIN_SERVICE_PERMISSION_HANDLER: PluginServicePermissionHandler = {
	token: ANALYTICS_PERMISSION_SERVICE_TOKEN,
	permissionType: 'analytics',
	cacheKey: 'analytics',
	createGuardedService: (pluginName, resolvedService, permissions) =>
		createGuardedAnalyticsPermissionService(pluginName, resolvedService as AnalyticsPermissionService, permissions),
	unavailableMessage: (pluginName) =>
		`Plugin '${pluginName}' attempted to resolve analytics service but it is not available.`
}

export function registerAnalyticsPluginServicePermissionHandler(): void {
	registerPluginServicePermissionHandler(ANALYTICS_PLUGIN_SERVICE_PERMISSION_HANDLER)
}
