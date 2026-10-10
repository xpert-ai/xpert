import { IApiPrincipal, SecretTokenBindingType } from '@xpert-ai/contracts'
import { ApiKeyOrClientSecretAuthGuard } from '@xpert-ai/server-core'
import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { t } from 'i18next'
import { assertWorkbenchPrincipal } from '../../ai/workbench-principal'

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
        if (!principal?.principalType) return true
        assertWorkbenchPrincipal(principal)

        const boundXpertId = principal.resourceScope?.kind === 'assistant' ? principal.resourceScope.xpertId : undefined
        if (
            (principal.principalType === 'client_secret' &&
                principal.clientSecretBindingType !== SecretTokenBindingType.USER_XPERT) ||
            principal.resourceScope?.kind !== 'assistant' ||
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
