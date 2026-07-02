import {
	GLOBAL_ORGANIZATION_SCOPE,
	SYSTEM_GLOBAL_SCOPE,
	getTenantGlobalScopeKey,
	isTenantGlobalScopeKey,
	TENANT_GLOBAL_SCOPE_PREFIX,
	TENANT_GLOBAL_SCOPE_SUFFIX
} from '@xpert-ai/plugin-sdk'

export interface PluginScopeInput {
	tenantId?: string | null
	organizationId?: string | null
	defaultTenantId?: string | null
	scopeKey?: string | null
}

export interface ResolvedPluginScope {
	tenantId: string | null
	organizationId: string
	scopeKey: string
	isGlobal: boolean
	isSystem: boolean
	isTenantGlobal: boolean
	isDefaultTenantGlobal: boolean
}

function normalizeOptionalString(value?: string | null) {
	return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

export function parseTenantIdFromPluginScopeKey(scopeKey?: string | null) {
	if (!isTenantGlobalScopeKey(scopeKey)) {
		return null
	}

	return scopeKey.slice(TENANT_GLOBAL_SCOPE_PREFIX.length, -TENANT_GLOBAL_SCOPE_SUFFIX.length)
}

export function resolvePluginScope(input: PluginScopeInput = {}): ResolvedPluginScope {
	const tenantId = normalizeOptionalString(input.tenantId) ?? parseTenantIdFromPluginScopeKey(input.scopeKey)
	const defaultTenantId = normalizeOptionalString(input.defaultTenantId)
	const requestedScopeKey = normalizeOptionalString(input.scopeKey)
	const isSystem = requestedScopeKey === SYSTEM_GLOBAL_SCOPE
	const organizationId = isSystem
		? GLOBAL_ORGANIZATION_SCOPE
		: (normalizeOptionalString(input.organizationId) ?? GLOBAL_ORGANIZATION_SCOPE)
	const isGlobal = organizationId === GLOBAL_ORGANIZATION_SCOPE
	const scopeKey =
		requestedScopeKey ??
		(isGlobal && tenantId && defaultTenantId && tenantId !== defaultTenantId
			? getTenantGlobalScopeKey(tenantId)
			: organizationId)
	const isTenantGlobal = isGlobal && !isSystem && isTenantGlobalScopeKey(scopeKey)
	const isDefaultTenantGlobal = isGlobal && !isSystem && !isTenantGlobal

	return {
		tenantId,
		organizationId,
		scopeKey,
		isGlobal,
		isSystem,
		isTenantGlobal,
		isDefaultTenantGlobal
	}
}

export function getPluginScopeKey(input: PluginScopeInput = {}) {
	return resolvePluginScope(input).scopeKey
}

export function getPluginScopeLogLabel(input: PluginScopeInput = {}) {
	const scope = resolvePluginScope(input)
	if (scope.isSystem) {
		return SYSTEM_GLOBAL_SCOPE
	}
	return scope.isTenantGlobal ? `${GLOBAL_ORGANIZATION_SCOPE}(${scope.tenantId})` : scope.organizationId
}

export function safePluginScopePathSegment(value: string) {
	return value.replace(/[^a-zA-Z0-9._-]/g, '_')
}
