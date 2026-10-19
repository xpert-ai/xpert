import type { CommandBus } from '@nestjs/cqrs'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import type { ChatConversation } from '../conversation.entity'
import { ResolveGroupRuntimeAccessCommand } from '../../chat-group/group-runtime-access.command'
import { groupDenied } from '../../chat-group/group.errors'

/** File-only authority: never establish a dispatch runtime or replace the authenticated principal. */
export async function assertGroupWorkspaceFileAccess(
    commands: Pick<CommandBus, 'execute'>,
    conversation: ChatConversation
) {
    const actor = {
        tenantId: RequestContext.currentTenantId(),
        organizationId: RequestContext.getOrganizationId(),
        userId: RequestContext.currentUserId()
    }
    if (
        !actor.tenantId ||
        !actor.organizationId ||
        !actor.userId ||
        conversation.purpose !== 'group_assistant_runtime' ||
        conversation.tenantId !== actor.tenantId ||
        conversation.organizationId !== actor.organizationId
    )
        throw groupDenied()

    // Resolve the active participant, group and exact runtime/thread/Assistant binding from persistence.
    // The handler rechecks organization/group membership, credential audience/expiry and resource access.
    const access = await commands.execute(
        new ResolveGroupRuntimeAccessCommand(actor, {
            type: 'runtime',
            conversationId: conversation.id
        })
    )
    if (access.assistantId !== conversation.xpertId) throw groupDenied()
}
