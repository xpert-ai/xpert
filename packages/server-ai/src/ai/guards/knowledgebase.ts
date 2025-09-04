import { IApiKey } from '@metad/contracts'
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'

@Injectable()
export class KnowledgebaseOwnerGuard implements CanActivate {
	constructor(private readonly reflector: Reflector) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest()
		const user = request.user
		const apiKey = user.apiKey as IApiKey

		if (!apiKey) {
			throw new ForbiddenException('API key not found')
		}

		// @todo ApiKey needs to be used to create a new knowledge base, so it cannot be restricted in ids.
		// const ids = apiKey.entityId?.split(',').map((id) => id.trim())
		// if (apiKey?.type !== 'knowledgebase' || !ids.includes(request.params.id)) {
		// 	throw new ForbiddenException('Access denied')
		// }

		return true
	}
}
