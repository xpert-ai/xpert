// Authorization comes from the authenticated request, never /user/me's display cache.
// Reloading role grants here would restore permissions excluded by the token.
import { ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import type { IRolePermission } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { ResolveUserOrganizationAccessCommand } from '../../user-organization/commands/resolve-user-organization-access.command'
import { effectiveRolePermissions } from './effective-role-permissions'

@Injectable()
export class CurrentUserPermissionsService {
	constructor(private readonly commandBus: CommandBus) {}

	async get(): Promise<IRolePermission['permission'][]> {
		const user = RequestContext.currentUser()
		const scope = RequestContext.getScope()
		const tenantHeader = RequestContext.currentRequest()?.headers['tenant-id']
		if (
			!user?.id ||
			!user.tenantId ||
			!user.roleId ||
			RequestContext.currentApiPrincipal() ||
			(tenantHeader !== undefined && tenantHeader !== user.tenantId)
		) {
			throw new ForbiddenException(
				t('server-ai:Error.CurrentPermissionsScopeDenied', {
					defaultValue: 'Current permissions are unavailable in this request scope.'
				})
			)
		}

		if (scope.organizationId) {
			const access = await this.commandBus.execute(
				new ResolveUserOrganizationAccessCommand({
					userId: user.id,
					tenantId: user.tenantId,
					organizationId: scope.organizationId
				})
			)
			if (!access) {
				throw new ForbiddenException(
					t('server-ai:Error.CurrentPermissionsScopeDenied', {
						defaultValue: 'Current permissions are unavailable in this request scope.'
					})
				)
			}
		}

		const grants = user.role?.rolePermissions
		if (!grants) {
			throw new ServiceUnavailableException(
				t('server-ai:Error.CurrentPermissionsUnavailable', {
					defaultValue: 'Authentication did not provide effective permissions. Please retry.'
				})
			)
		}
		return effectiveRolePermissions(grants, user.tenantId, user.roleId)
	}
}
