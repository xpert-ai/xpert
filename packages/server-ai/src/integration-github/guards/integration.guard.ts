import { IntegrationEnum } from '@metad/contracts'
import { IntegrationService } from '@metad/server-core'
import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'

@Injectable()
export class IntegrationGitHubGuard implements CanActivate {
	constructor(
		private readonly reflector: Reflector,
		private readonly integrationService: IntegrationService
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest()
		const id = request.params.id

		const integration = await this.integrationService.findOne(id)

		if (!integration) {
			throw new ForbiddenException('GitHub integration not found')
		}
		if (integration.provider !== IntegrationEnum.GITHUB) {
			throw new NotFoundException(`Integration ${id} is not GitHub integration`)
		}

		return true
	}
}
