// Runs after authentication, including route-local API-key and client-secret guards.
// Endpoints without permission metadata retain the global authentication policy.
import { CallHandler, ExecutionContext, ForbiddenException, Injectable, Logger, NestInterceptor } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { IUser } from '@xpert-ai/contracts'
import { PERMISSIONS_METADATA } from '@xpert-ai/server-common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { evaluatePermissions } from './permission-policy'

@Injectable()
export class EndpointPermissionInterceptor implements NestInterceptor {
	private readonly logger = new Logger(EndpointPermissionInterceptor.name)
	constructor(private readonly reflector: Reflector) {}

	intercept(context: ExecutionContext, next: CallHandler) {
		const permissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_METADATA, [
			context.getHandler(),
			context.getClass()
		])
		if (permissions === undefined) return next.handle()
		const request = context.switchToHttp().getRequest<{ user?: IUser }>()
		const user = request.user ?? RequestContext.currentUser()
		const handler = context.getHandler(),
			controller = context.getClass()
		const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [handler, controller])
		if (!user && isPublic) return next.handle()
		const decision = evaluatePermissions(user, permissions)
		if (decision.allowed === false) {
			this.logger.debug({
				event: 'authorization_denied',
				reason: decision.reason,
				controller: controller.name,
				handler: handler.name
			})
			this.denied()
		}
		return next.handle()
	}

	private denied(): never {
		throw new ForbiddenException({
			code: 'permission_denied',
			message: t('server-ai:Error.EndpointPermissionDenied', {
				defaultValue: 'You do not have permission to perform this operation.'
			})
		})
	}
}
