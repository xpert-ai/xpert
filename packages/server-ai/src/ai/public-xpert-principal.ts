import { AssertUserXpertGrantQuery } from '@xpert-ai/server-core'
import { ForbiddenException } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { IApiPrincipal, IChatConversation, SecretTokenBindingType } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { IsPublishedXpertInFamilyQuery } from '../xpert/queries'

export function getPublicXpertSessionAssistantId() {
    const principal =
        typeof RequestContext.currentApiPrincipal === 'function'
            ? (RequestContext.currentApiPrincipal() as IApiPrincipal | null)
            : null
    if (
        principal?.principalType !== 'client_secret' ||
        (principal.clientSecretBindingType !== SecretTokenBindingType.PUBLIC_XPERT &&
            principal.clientSecretBindingType !== SecretTokenBindingType.ENTERPRISE_XPERT)
    ) {
        return null
    }

    if (principal.resourceScope?.kind !== 'assistant' || !principal.resourceScope.xpertId.trim()) {
        throw new ForbiddenException(t('server-ai:Error.RestrictedAssistantBindingRequired'))
    }

    return principal.resourceScope.xpertId.trim()
}

export function getPublicXpertSessionConversationScope() {
    const xpertId = getPublicXpertSessionAssistantId()
    if (!xpertId) {
        return null
    }

    const createdById = RequestContext.currentUserId()
    if (!createdById) {
        throw new ForbiddenException(t('server-ai:Error.RestrictedAssistantUserContextRequired'))
    }

    return { createdById, xpertId }
}

export async function assertPublicXpertSessionConversationAccess(
    conversation: Pick<IChatConversation, 'createdById' | 'xpertId'>,
    queryBus: Pick<QueryBus, 'execute'>
) {
    const principal = RequestContext.currentApiPrincipal()
    if (
        principal?.principalType === 'client_secret' &&
        principal.clientSecretBindingType === SecretTokenBindingType.USER_XPERT
    ) {
        // Recheck ongoing SSE subscriptions as well as newly authenticated requests.
        await queryBus.execute(new AssertUserXpertGrantQuery())
        // The human's conversation/Project permissions are checked by the caller.
        // A delegated credential additionally restricts that authority to one Assistant
        // family, even when the same human owns conversations with other Assistants.
        const audience = principal.resourceScope
        if (audience?.kind !== 'assistant' || !audience.xpertId?.trim() || !conversation.xpertId) {
            throw new ForbiddenException(t('server-ai:Error.AssistantAccessForbidden'))
        }
        if (conversation.xpertId !== audience.xpertId.trim()) {
            const isSameFamily = await queryBus.execute(
                new IsPublishedXpertInFamilyQuery(conversation.xpertId, audience.xpertId.trim())
            )
            if (!isSameFamily) throw new ForbiddenException(t('server-ai:Error.AssistantAccessForbidden'))
        }
        return
    }
    const scope = getPublicXpertSessionConversationScope()
    if (!scope) {
        return
    }

    if (conversation.createdById !== scope.createdById) {
        throw new ForbiddenException(t('server-ai:Error.AssistantAccessForbidden'))
    }

    if (conversation.xpertId && conversation.xpertId !== scope.xpertId) {
        const isSameFamily = await queryBus.execute(
            new IsPublishedXpertInFamilyQuery(conversation.xpertId, scope.xpertId)
        )
        if (!isSameFamily) {
            throw new ForbiddenException(t('server-ai:Error.AssistantAccessForbidden'))
        }
    }
}
