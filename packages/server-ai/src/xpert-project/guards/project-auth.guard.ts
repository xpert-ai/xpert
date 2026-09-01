import { IApiPrincipal, SecretTokenBindingType } from '@xpert-ai/contracts'
import { ApiKeyOrClientSecretAuthGuard } from '@xpert-ai/server-core'
import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { t } from 'i18next'

/**
 * Project APIs accept interactive ChatKit sessions, but never public or
 * enterprise assistant client secrets. USER_XPERT sessions restore the real
 * signed-in user, so the ordinary Project permission and membership guards
 * remain the final authorization boundary.
 */
@Injectable()
export class XpertProjectAuthGuard extends ApiKeyOrClientSecretAuthGuard {
    constructor(reflector: Reflector) {
        super(reflector)
    }

    override async canActivate(context: ExecutionContext): Promise<boolean> {
        const authenticated = await super.canActivate(context)
        if (!authenticated) return false

        const principal = context.switchToHttp().getRequest<{ user?: IApiPrincipal }>().user
        if (
            principal?.principalType === 'client_secret' &&
            principal.clientSecretBindingType !== SecretTokenBindingType.USER_XPERT
        ) {
            throw new ForbiddenException(
                t('server-ai:Error.ProjectInteractiveSessionRequired', {
                    defaultValue: 'An interactive user ChatKit session is required to access Projects'
                })
            )
        }

        return true
    }
}
