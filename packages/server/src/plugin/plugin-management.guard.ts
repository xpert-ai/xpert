import { CanActivate, ForbiddenException, Injectable } from '@nestjs/common'
import { GLOBAL_ORGANIZATION_SCOPE, RequestContext } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { canManageGlobalPlugins } from './plugin-update.utils'

/** Runs after TenantScopeGuard; tenant-wide management requires a platform administrator. */
@Injectable()
export class PluginManagementGuard implements CanActivate {
	canActivate(): boolean {
		const organizationId = RequestContext.getOrganizationId()
		if ((organizationId && organizationId !== GLOBAL_ORGANIZATION_SCOPE) || canManageGlobalPlugins()) return true
		throw new ForbiddenException({
			code: 'plugin_management_scope_denied',
			message: t('server-ai:Error.PluginManagementScopeDenied', {
				defaultValue: 'Plugin management requires an authorized organization or a super administrator.'
			})
		})
	}
}
