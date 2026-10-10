import { IApiPrincipal, IChatConversation, IUser, SecretTokenBindingType } from '@xpert-ai/contracts'
import { ForbiddenException } from '@nestjs/common'
import { t } from 'i18next'

/** Interactive workspace tools require the delegated user's Assistant binding. */
export function assertWorkbenchPrincipal(principal: IUser | IApiPrincipal, conversation?: IChatConversation) {
    if (!('principalType' in principal)) return
    if (
        (principal.principalType === 'client_secret' &&
            principal.clientSecretBindingType !== SecretTokenBindingType.USER_XPERT) ||
        principal.resourceScope?.kind !== 'assistant' ||
        !principal.resourceScope.xpertId ||
        !principal.tenantId ||
        (principal.apiKey && principal.apiKey.tenantId !== principal.tenantId) ||
        (principal.requestedOrganizationId &&
            principal.apiKey &&
            principal.requestedOrganizationId !== principal.apiKey.organizationId) ||
        (conversation &&
            (conversation.xpertId !== principal.resourceScope.xpertId ||
                conversation.tenantId !== principal.tenantId ||
                (conversation.organizationId ?? null) !==
                    ((principal.apiKey ? principal.apiKey.organizationId : principal.requestedOrganizationId) ?? null)))
    ) {
        throw new ForbiddenException(
            t('server-ai:Error.AssistantAccessForbidden', {
                defaultValue: 'You do not have access to this assistant.'
            })
        )
    }
}
