import { RequestContext } from '@metad/server-core'
import { CACHE_MANAGER, CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Cache } from 'cache-manager'
import { XpertWorkspaceService } from '../../xpert-workspace/workspace.service'
import { XpertService } from '../xpert.service'

@Injectable()
export class XpertGuard implements CanActivate {
	constructor(
		@Inject(CACHE_MANAGER) private cacheManager: Cache,
		private readonly reflector: Reflector,
		private readonly xpertService: XpertService,
		private readonly workspaceService: XpertWorkspaceService
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest()
		const user = request.user
		const xpertId = request.params.id

		// Retrieve current tenant ID from RequestContext
		const tenantId = RequestContext.currentTenantId()

		const cacheKey = `userXperts_${tenantId}_${user.id}_${xpertId}`

		const fromCache = await this.cacheManager.get<boolean | null>(cacheKey)

		if (fromCache) {
			return fromCache
		}

		let isAuthorized = false
		const xpert = await this.xpertService.findOne(xpertId)
		if (xpert.createdById === user.id) {
			isAuthorized = true
		} else {
			const workspace = await this.workspaceService.findOne(xpert.workspaceId, { relations: ['members'] })

			if (!workspace) {
				throw new ForbiddenException('Access denied')
			}

			const isMember = workspace.members.some((member) => member.id === user.id)
			const isOwner = workspace.ownerId === user.id

			if (!isMember && !isOwner) {
				throw new ForbiddenException('Access denied')
			}

			isAuthorized = true
		}

		if (isAuthorized) {
			await this.cacheManager.set(
				cacheKey,
				isAuthorized,
				5 * 60 * 1000 // 5 minutes cache expiration time for User Permissions
			)
		}

		return isAuthorized
	}
}
