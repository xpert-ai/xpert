import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { XpertWorkspaceAccessService } from '../workspace-access.service'

@Injectable()
export class WorkspaceOwnerGuard implements CanActivate {
	constructor(
		private readonly reflector: Reflector,
		private readonly workspaceAccessService: XpertWorkspaceAccessService
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest()
		const workspaceId = request.params.workspaceId

		if (!workspaceId) {
			throw new ForbiddenException('Workspace not found')
		}

		await this.workspaceAccessService.assertCanManage(workspaceId)

		return true
	}
}
