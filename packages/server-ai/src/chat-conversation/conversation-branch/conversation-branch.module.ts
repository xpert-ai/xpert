import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { ChatConversationModule } from '../conversation.module'
import { ChatMessageModule } from '../../chat-message/chat-message.module'
import { CopilotCheckpointModule } from '../../copilot-checkpoint/copilot-checkpoint.module'
import { FileUnderstandingModule } from '../../file-understanding/file-understanding.module'
import { XpertModule } from '../../xpert/xpert.module'
import { XpertProjectModule } from '../../xpert-project/project.module'
import { ConversationBranchHandler } from './branch.handler'
import { ConversationBranchService } from './conversation-branch.service'

// Compose domain dependencies here; callers use the command without importing this module.
@Module({
    imports: [
        CqrsModule,
        ChatConversationModule,
        ChatMessageModule,
        CopilotCheckpointModule,
        FileUnderstandingModule,
        XpertModule,
        XpertProjectModule
    ],
    providers: [ConversationBranchService, ConversationBranchHandler]
})
export class ConversationBranchModule {}
