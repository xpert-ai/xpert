import { RequestContext } from '@metad/server-core'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Cache } from 'cache-manager'
import { XpertWorkspaceService } from '../../xpert-workspace/workspace.service'
import { XpertToolsetService } from '../xpert-toolset.service'

@Injectable()
export class ToolsetGuard implements CanActivate {
	constructor(
		@Inject(CACHE_MANAGER) private cacheManager: Cache,
		private readonly reflector: Reflector,
		private readonly service: XpertToolsetService,
		private readonly workspaceService: XpertWorkspaceService
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest()
		const user = request.user
		const toolsetId = request.params.id

		// Retrieve current tenant ID from RequestContext
		const tenantId = RequestContext.currentTenantId()

		const cacheKey = `userToolset_${tenantId}_${user.id}_${toolsetId}`

		const fromCache = await this.cacheManager.get<boolean | null>(cacheKey)

		if (fromCache) {
			return fromCache
		}

		let isAuthorized = false
		const toolset = await this.service.findOne(toolsetId)
		if (toolset.createdById === user.id) {
			isAuthorized = true
		} else {
			isAuthorized = await this.workspaceService.canAccess(toolset.workspaceId, user.id)

			if (!isAuthorized) {
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
