import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { IUser } from '@xpert-ai/contracts'
import { PERMISSIONS_METADATA } from '@xpert-ai/server-common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { evaluatePermissions } from './permission-policy'

/** Compatibility adapter for existing routes; shares the post-authentication interceptor's policy. */
@Injectable()
export class PermissionGuard implements CanActivate {
	private readonly logger = new Logger(PermissionGuard.name)
	constructor(private readonly reflector: Reflector) {}

	canActivate(context: ExecutionContext): boolean {
		const permissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_METADATA, [
			context.getHandler(),
			context.getClass()
		])
		const request = context.switchToHttp().getRequest<{ user?: IUser } | undefined>()
		const decision = evaluatePermissions(request?.user ?? RequestContext.currentUser(), permissions)
		if (decision.allowed === false)
			this.logger.debug({
				event: 'authorization_denied',
				reason: decision.reason,
				controller: context.getClass().name,
				handler: context.getHandler().name
			})
		return decision.allowed
	}
}
