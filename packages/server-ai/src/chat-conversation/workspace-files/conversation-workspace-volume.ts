import { BadRequestException } from '@nestjs/common'
import type { CommandBus } from '@nestjs/cqrs'
import type { ChatConversation } from '../conversation.entity'
import { VolumeClient, VolumeSubtreeClient } from '../../shared/volume'
import { ResolveConversationEnvironmentFilesCommand } from './resolve-conversation-environment-files.command'
import {
    AssistantFileOperation,
    ResolveAssistantFileAccessCommand
} from '../../xpert/assistant-files/resolve-assistant-file-access.command'

/** Call only after conversation authorization; retain Project precedence and the Assistant file ACL. */
export async function createConversationWorkspaceVolumeClient(
    conversation: ChatConversation,
    operation: AssistantFileOperation,
    commands: Pick<CommandBus, 'execute'>,
    volumes: Pick<VolumeClient, 'resolve'>
) {
    if (conversation.projectId) {
        return {
            client: new VolumeSubtreeClient(
                volumes.resolve({
                    tenantId: conversation.tenantId,
                    catalog: 'projects',
                    projectId: conversation.projectId,
                    userId: conversation.createdById
                }),
                { allowRootWorkspace: true }
            ),
            scopePath: ''
        }
    }
    const environmentId = conversation.options?.sandboxEnvironmentId?.trim()
    if (environmentId) {
        const scope = await commands.execute(
            new ResolveConversationEnvironmentFilesCommand({ conversation, environmentId })
        )
        return {
            client: new VolumeSubtreeClient(volumes.resolve(scope), { allowRootWorkspace: true }),
            scopePath: ''
        }
    }
    if (conversation.xpertId) {
        const access = await commands.execute(
            new ResolveAssistantFileAccessCommand(conversation.xpertId, operation, 'runtime')
        )
        return {
            client: new VolumeSubtreeClient(volumes.resolve(access.scope), { allowRootWorkspace: true }),
            scopePath: ''
        }
    }
    throw new BadRequestException('Non-project conversations require xpertId to access workspace files')
}
