import {
    ApiKeyBindingType,
    IApiKey,
    IApiPrincipal,
    IChatConversation,
    IUser,
    IXpert,
    isTenantSharedXpertWorkspace,
    RequestScopeLevel,
    SecretTokenBindingType
} from '@xpert-ai/contracts'
import { ForbiddenException } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ChatConversationBindXpertCommand } from '../chat-conversation/commands/bind-xpert.command'
import { ChatConversationBindProjectCommand } from '../chat-conversation/commands/bind-project.command'
import { PublishedXpertAccessService, XpertPrincipalService } from '../xpert'

/**
 * Invariants: authorize the assistant before binding a conversation, preserve
 * consumer organization scope for tenant-shared assistants, and never rebind
 * an existing conversation to a different assistant.
 */

type MutableRequestContextRequest = NonNullable<ReturnType<typeof RequestContext.currentRequest>> & {
    user?: IUser | IApiPrincipal | null
}

export async function resolveAssistantForRequest(
    assistantId: string,
    publishedXpertAccessService: Pick<PublishedXpertAccessService, 'getAccessiblePublishedXpert'>,
    xpertPrincipalService?: Pick<XpertPrincipalService, 'ensurePrincipalUser'>
) {
    const apiKey = RequestContext.currentApiKey()
    const apiPrincipal = RequestContext.currentApiPrincipal() as IApiPrincipal | null
    // USER_XPERT is interactive delegation: preserve the authenticated
    // business user's permissions and audit identity for the assistant run.
    const delegatedUser =
        apiPrincipal?.principalType === 'client_secret' &&
        apiPrincipal.clientSecretBindingType === SecretTokenBindingType.USER_XPERT
            ? (RequestContext.currentUser() as IUser | null)
            : null

    if (apiKey?.type === ApiKeyBindingType.ASSISTANT && apiKey.entityId && apiKey.entityId !== assistantId) {
        throw new ForbiddenException('API key is not allowed to access this assistant.')
    }

    const xpert = await publishedXpertAccessService.getAccessiblePublishedXpert(assistantId, {
        relations: ['user', 'createdBy', 'workspace']
    })

    if (apiKey?.type === ApiKeyBindingType.WORKSPACE && apiKey.entityId && xpert.workspaceId !== apiKey.entityId) {
        throw new ForbiddenException('API key is not allowed to access this workspace assistant.')
    }

    if (delegatedUser) {
        return {
            ...xpert,
            user: delegatedUser,
            userId: delegatedUser.id
        }
    }

    if (xpertPrincipalService) {
        const principalUser = await xpertPrincipalService.ensurePrincipalUser(xpert)
        return {
            ...xpert,
            user: principalUser,
            userId: principalUser.id
        }
    }

    return xpert
}

export function applyAssistantScope(xpert: IXpert) {
    const apiKey = RequestContext.currentApiKey()
    const keepConsumerOrganizationScope =
        !xpert.organizationId && RequestContext.isOrganizationScope() && isTenantSharedXpertWorkspace(xpert.workspace)

    if (!keepConsumerOrganizationScope) {
        applyAssistantScopeToCurrentRequest(xpert.organizationId ?? null)
    }
    applyAssistantPrincipalToCurrentRequest(apiKey, xpert.user ?? null)
}

export function assertConversationAssistantBinding(
    conversation: Pick<IChatConversation, 'xpertId'>,
    assistantId: string
) {
    if (conversation.xpertId && conversation.xpertId !== assistantId) {
        throw new ForbiddenException()
    }
}

export async function bindConversationAssistantIfUnbound(
    commandBus: CommandBus,
    conversation: IChatConversation,
    assistantId: string
): Promise<IChatConversation> {
    assertConversationAssistantBinding(conversation, assistantId)
    if (conversation.xpertId) {
        return conversation
    }

    const persisted = await commandBus.execute(new ChatConversationBindXpertCommand(conversation.id, assistantId))
    assertConversationAssistantBinding(persisted, assistantId)
    return persisted
}

/** Bind a conversation to the requested Project once and reject later scope changes. */
export async function bindConversationProjectIfUnbound(
    commandBus: CommandBus,
    conversation: IChatConversation,
    requestedProjectId?: string
): Promise<IChatConversation> {
    if (!requestedProjectId) {
        return conversation
    }
    // A persisted conversation is a Project security boundary. A route or
    // request may initialize that boundary once, but can never move it later.
    if (conversation.projectId && conversation.projectId !== requestedProjectId) {
        throw new ForbiddenException('The route Project does not match the conversation Project')
    }
    if (conversation.projectId) {
        return conversation
    }

    // The command performs a compare-and-set update so concurrent first sends
    // cannot bind the same conversation to different Projects.
    return commandBus.execute(new ChatConversationBindProjectCommand(conversation.id, requestedProjectId))
}

function applyAssistantScopeToCurrentRequest(organizationId?: string | null) {
    const request = RequestContext.currentRequest() as MutableRequestContextRequest | null

    if (!request?.headers) {
        return
    }

    if (organizationId) {
        request.headers['organization-id'] = organizationId
        request.headers['x-scope-level'] = RequestScopeLevel.ORGANIZATION
        return
    }

    delete request.headers['organization-id']
    request.headers['x-scope-level'] = RequestScopeLevel.TENANT
}

function applyAssistantPrincipalToCurrentRequest(
    apiKey: IApiKey | null | undefined,
    principalUser: IUser | null | undefined
) {
    const request = RequestContext.currentRequest() as MutableRequestContextRequest | null
    const currentUser = RequestContext.currentUser() as IApiPrincipal | null

    if (!request || !apiKey || !principalUser) {
        return
    }

    if (
        currentUser?.principalType === 'client_secret' &&
        currentUser.clientSecretBindingType === SecretTokenBindingType.PUBLIC_XPERT
    ) {
        return
    }

    // An explicit x-principal-user-id represents the business user and must not
    // be overwritten by the assistant technical principal.
    if (currentUser?.requestedUserId) {
        return
    }

    request.user = {
        ...principalUser,
        apiKey,
        ownerUserId: currentUser?.ownerUserId ?? apiKey.createdById ?? principalUser.id ?? null,
        apiKeyUserId: currentUser?.apiKeyUserId ?? apiKey.userId ?? principalUser.id ?? null,
        requestedUserId: currentUser?.requestedUserId ?? null,
        requestedOrganizationId: currentUser?.requestedOrganizationId ?? null,
        principalType: currentUser?.principalType ?? 'api_key'
    }
}
