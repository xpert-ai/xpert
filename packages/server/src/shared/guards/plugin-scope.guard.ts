import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import {
	GLOBAL_ORGANIZATION_SCOPE,
	isTenantGlobalScopeKey,
	ORGANIZATION_METADATA_KEY,
	RequestContext,
	resolveTenantGlobalScopeKey,
	SYSTEM_GLOBAL_SCOPE
} from '@xpert-ai/plugin-sdk'

/** Prevents process-loaded plugin controllers from serving requests outside their installation scope. */
@Injectable()
export class PluginScopeGuard implements CanActivate {
	constructor(private readonly reflector: Reflector) {}

	canActivate(context: ExecutionContext) {
		const pluginScope = this.reflector.getAllAndOverride<string>(ORGANIZATION_METADATA_KEY, [
			context.getHandler(),
			context.getClass()
		])
		if (!pluginScope || pluginScope === SYSTEM_GLOBAL_SCOPE) {
			return true
		}

		const requestScope = RequestContext.getScope?.()
		const tenantId = requestScope?.tenantId ?? RequestContext.currentTenantId()
		const organizationId = requestScope?.organizationId ?? RequestContext.getOrganizationId()
		const tenantGlobalScope = resolveTenantGlobalScopeKey(tenantId)
		const allowed = isTenantGlobalScopeKey(pluginScope)
			? pluginScope === tenantGlobalScope
			: pluginScope === GLOBAL_ORGANIZATION_SCOPE
				? tenantGlobalScope === GLOBAL_ORGANIZATION_SCOPE
				: pluginScope === organizationId

		if (!allowed) {
			throw new ForbiddenException('Plugin endpoint is not available in the current tenant or organization scope')
		}

		return true
	}
}
