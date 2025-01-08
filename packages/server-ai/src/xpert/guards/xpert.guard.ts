import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { XpertWorkspaceService } from '../../xpert-workspace/workspace.service'
import { XpertService } from '../xpert.service'

@Injectable()
export class XpertGuard implements CanActivate {
	constructor(
		private readonly reflector: Reflector,
		private readonly xpertService: XpertService,
		private readonly workspaceService: XpertWorkspaceService
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest()
		const user = request.user
		const xpertId = request.params.id

		const xpert = await this.xpertService.findOne(xpertId)
		if (xpert.createdById === user.id) {
			return true
		}

		const workspace = await this.workspaceService.findOne(xpert.workspaceId, { relations: ['members'] })

		if (!workspace) {
			throw new ForbiddenException('Access denied')
		}

		const isMember = workspace.members.some((member) => member.id === user.id)
		const isOwner = workspace.ownerId === user.id

		if (!isMember && !isOwner) {
			throw new ForbiddenException('Access denied')
		}

		return true
	}
}
