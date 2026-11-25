import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import {
	AIPermissionsEnum,
	type IApiPrincipal,
	type IUser,
	SecretTokenBindingType,
	UserType
} from '@xpert-ai/contracts'
import { PERMISSIONS_METADATA } from '@xpert-ai/server-common'

const verifiedPublicVisitor = Symbol('verifiedPublicVisitor')
type PublicVisitor = IApiPrincipal & {
	principalType: 'client_secret'
	clientSecretBindingType: SecretTokenBindingType.PUBLIC_XPERT
}
type ChatRequest = { user?: IUser; [verifiedPublicVisitor]?: PublicVisitor }

export function isPublicVisitorSession(user?: IUser | null): user is PublicVisitor {
	return (
		!!user &&
		'principalType' in user &&
		user.principalType === 'client_secret' &&
		'clientSecretBindingType' in user &&
		user.clientSecretBindingType === SecretTokenBindingType.PUBLIC_XPERT
	)
}

/** Admits authenticated public visitors to CHAT_VIEW. The handler enforces Assistant and conversation access. */
@Injectable()
export class PublicVisitorChatGuard implements CanActivate {
	constructor(private readonly reflector: Reflector) {}

	canActivate(context: ExecutionContext): boolean {
		const request = context.switchToHttp().getRequest<ChatRequest>()
		const visitor = request.user
		if (!isPublicVisitorSession(visitor)) return true

		const permissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_METADATA, [
			context.getHandler(),
			context.getClass()
		])
		if (permissions?.length !== 1 || permissions[0] !== AIPermissionsEnum.CHAT_VIEW) return false
		if (
			visitor.type !== UserType.COMMUNICATION ||
			visitor.isActive === false ||
			!visitor.id ||
			!visitor.tenantId ||
			!visitor.clientSecretId ||
			visitor.resourceScope?.kind !== 'assistant' ||
			!visitor.resourceScope.xpertId?.trim()
		)
			return false

		request[verifiedPublicVisitor] = visitor
		return true
	}

	static verifiedVisitor(request?: ChatRequest): PublicVisitor | undefined {
		return request?.[verifiedPublicVisitor]
	}
}
