import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { AIPermissionsEnum, SecretTokenBindingType, XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { assertPublicXpertSessionConversationAccess } from '../../ai/public-xpert-principal'
import { ResolveAssistantFileAccessCommand } from '../../xpert/assistant-files/resolve-assistant-file-access.command'
import { ChatConversationService } from '../../chat-conversation/conversation.service'
import { FileMemoryViewAccess, FileMemoryXpertScope } from '../../plugins/file-memory/ports'

@Injectable()
export class XpertMemoryViewAccess implements FileMemoryViewAccess {
    constructor(
        private readonly commands: CommandBus,
        private readonly queries: QueryBus,
        private readonly conversations: ChatConversationService
    ) {}
    async resolve(context: XpertResolvedViewHostContext) {
        const { hostType, hostId, runtimeScope, tenantId, organizationId, userId } = context
        const studio = hostType === 'assistant-studio'
        const principal = RequestContext.currentApiPrincipal()
        const bound = principal?.resourceScope
        const interactive =
            principal?.principalType === 'client_secret' &&
            (principal.clientSecretBindingType === SecretTokenBindingType.USER_XPERT ||
                principal.clientSecretBindingType === SecretTokenBindingType.ENTERPRISE_XPERT) &&
            bound?.kind === 'assistant' &&
            bound.xpertId === hostId
        if (
            (!studio && hostType !== 'agent') ||
            !runtimeScope ||
            !userId ||
            !tenantId ||
            (principal && (studio || !interactive)) ||
            RequestContext.currentTenantId() !== tenantId ||
            RequestContext.currentUserId() !== userId ||
            (RequestContext.getOrganizationId() ?? null) !== (organizationId ?? null)
        )
            throw new ForbiddenException()
        const projectId = runtimeScope.projectId
        const scope: FileMemoryXpertScope = { tenantId, organizationId, userId, id: hostId, projectId }
        if (projectId) {
            // The host resolves Project membership and the Assistant binding on each request.
            const access = runtimeScope.projectAccess
            if (studio || !access?.canRead) throw new ForbiddenException()
            return { scope, canEdit: access.canEdit, canManage: access.canManage }
        }
        const files = await this.commands.execute(
            new ResolveAssistantFileAccessCommand(hostId, 'capabilities', studio ? 'authoring' : 'runtime')
        )
        if (!files.capabilities.canRead) throw new ForbiddenException()
        scope.workspaceDataScope = files.scope.catalog === 'user-xperts' ? 'user' : 'shared'
        return {
            scope,
            canEdit: files.capabilities.canWrite,
            canManage: studio || !!context.permissions?.includes(AIPermissionsEnum.XPERT_EDIT)
        }
    }
    async canReadConversation(id: string) {
        try {
            const conversation = await this.conversations.assertAccess(id, 'read')
            await assertPublicXpertSessionConversationAccess(conversation, this.queries)
            return true
        } catch (error) {
            if (error instanceof ForbiddenException || error instanceof NotFoundException) return false
            throw error
        }
    }
}
