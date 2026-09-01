import { ApiKeyBindingType, IApiPrincipal, SecretTokenBindingType } from '@xpert-ai/contracts'
import { ApiKeyOrClientSecretAuthGuard } from '@xpert-ai/server-core'
import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { t } from 'i18next'

/**
 * Workspace file discovery accepts the delegated USER_XPERT session used by
 * ChatKit. The session remains scoped to its bound assistant, while XpertGuard
 * continues to enforce the signed-in user's ordinary workspace access.
 */
@Injectable()
export class XpertWorkspaceAuthGuard extends ApiKeyOrClientSecretAuthGuard {
    constructor(reflector: Reflector) {
        super(reflector)
    }

    override async canActivate(context: ExecutionContext): Promise<boolean> {
        const authenticated = await super.canActivate(context)
        if (!authenticated) return false

        const request = context.switchToHttp().getRequest<{
            params: { id?: string }
            user?: IApiPrincipal
        }>()
        const principal = request.user
        if (principal?.principalType !== 'client_secret') return true

        const boundXpertId = principal.apiKey?.entityId?.trim()
        if (
            principal.clientSecretBindingType !== SecretTokenBindingType.USER_XPERT ||
            principal.apiKey?.type !== ApiKeyBindingType.ASSISTANT ||
            !boundXpertId ||
            boundXpertId !== request.params.id
        ) {
            throw new ForbiddenException(
                t('server-ai:Error.AssistantAccessForbidden', {
                    defaultValue: 'You do not have access to this assistant.'
                })
            )
        }

        return true
    }
}
