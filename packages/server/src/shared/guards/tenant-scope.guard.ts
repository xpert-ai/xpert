import { t } from 'i18next'
import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import type { IUser } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ResolveUserOrganizationAccessCommand } from '../../user-organization/commands/resolve-user-organization-access.command'
import { resolveAuthenticatedRequestScope, ScopeRequest } from './request-scope'

/** Validates identity-bound tenant scope and live organization membership; grants no feature or resource rights. */
@Injectable()
export class TenantScopeGuard implements CanActivate {
	private readonly logger = new Logger(TenantScopeGuard.name)
	constructor(private readonly commands: CommandBus) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest<ScopeRequest & { user?: IUser }>()
		const user = request.user ?? RequestContext.currentUser()
		const scope = resolveAuthenticatedRequestScope(user, request)
		if (scope.organizationId) {
			const access = await this.commands.execute(
				new ResolveUserOrganizationAccessCommand({
					tenantId: scope.tenantId,
					organizationId: scope.organizationId,
					userId: user.id,
					allowServiceAccounts: true
				})
			)
			if (!access) {
				this.logger.debug({
					event: 'authorization_denied',
					reason: 'organization_access_denied',
					controller: context.getClass().name
				})
				throw new ForbiddenException({
					code: 'organization_access_denied',
					message: t('server-ai:Error.OrganizationAccessDenied', {
						defaultValue: 'Organization access denied.'
					})
				})
			}
		}
		return true
	}
}
