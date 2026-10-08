import { ApiKeyBindingType, IApiPrincipal, IChatConversation, IUser, SecretTokenBindingType } from '@xpert-ai/contracts'
import { ForbiddenException } from '@nestjs/common'
import { t } from 'i18next'

/** Interactive workspace tools require the delegated user's Assistant binding. */
export function assertWorkbenchPrincipal(principal: IUser | IApiPrincipal, conversation?: IChatConversation) {
    if (!('principalType' in principal)) return
    if (
        (principal.principalType === 'client_secret' &&
            principal.clientSecretBindingType !== SecretTokenBindingType.USER_XPERT) ||
        principal.apiKey?.type !== ApiKeyBindingType.ASSISTANT ||
        !principal.apiKey.entityId ||
        !principal.tenantId ||
        principal.apiKey.tenantId !== principal.tenantId ||
        (principal.requestedOrganizationId && principal.requestedOrganizationId !== principal.apiKey.organizationId) ||
        (conversation &&
            (conversation.xpertId !== principal.apiKey.entityId ||
                conversation.tenantId !== principal.tenantId ||
                (conversation.organizationId ?? null) !== (principal.apiKey.organizationId ?? null)))
    ) {
        throw new ForbiddenException(
            t('server-ai:Error.AssistantAccessForbidden', {
                defaultValue: 'You do not have access to this assistant.'
            })
        )
    }
}
