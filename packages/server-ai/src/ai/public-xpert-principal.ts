import { ForbiddenException } from '@nestjs/common'
import { ApiKeyBindingType, IApiPrincipal, IChatConversation, SecretTokenBindingType } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'

export function getPublicXpertSessionAssistantId() {
    const principal =
        typeof RequestContext.currentApiPrincipal === 'function'
            ? (RequestContext.currentApiPrincipal() as IApiPrincipal | null)
            : null
    if (
        principal?.principalType !== 'client_secret' ||
        principal.clientSecretBindingType !== SecretTokenBindingType.PUBLIC_XPERT
    ) {
        return null
    }

    if (principal.apiKey?.type !== ApiKeyBindingType.ASSISTANT || !principal.apiKey.entityId?.trim()) {
        throw new ForbiddenException('Public assistant session is not bound to an assistant.')
    }

    return principal.apiKey.entityId.trim()
}

export function getPublicXpertSessionConversationScope() {
    const xpertId = getPublicXpertSessionAssistantId()
    if (!xpertId) {
        return null
    }

    const createdById = RequestContext.currentUserId()
    if (!createdById) {
        throw new ForbiddenException('User context is required to access public assistant conversations.')
    }

    return { createdById, xpertId }
}

export function assertPublicXpertSessionConversationAccess(
    conversation: Pick<IChatConversation, 'createdById' | 'xpertId'>
) {
    const scope = getPublicXpertSessionConversationScope()
    if (!scope) {
        return
    }

    if (conversation.createdById !== scope.createdById) {
        throw new ForbiddenException('You do not have access to this conversation.')
    }

    if (conversation.xpertId && conversation.xpertId !== scope.xpertId) {
        throw new ForbiddenException('You do not have access to this conversation.')
    }
}
