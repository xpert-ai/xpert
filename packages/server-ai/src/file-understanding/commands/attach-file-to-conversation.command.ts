import { Command } from '@nestjs/cqrs'
import { XpertWorkspaceDataScope } from '@xpert-ai/contracts'
import { ConversationFileLink } from '../entities'

export class AttachFileToConversationCommand extends Command<ConversationFileLink> {
    static readonly type = '[File Understanding] Attach file to conversation'

    constructor(
        public readonly input: {
            fileAssetId: string
            conversationId: string
            storageFileId?: string
            threadId?: string
            projectId?: string
            xpertId?: string
            workspaceDataScope?: XpertWorkspaceDataScope | null
            sandboxEnvironmentId?: string
            sandboxProvider?: string | null
            metadata?: Record<string, unknown>
        }
    ) {
        super()
    }
}
