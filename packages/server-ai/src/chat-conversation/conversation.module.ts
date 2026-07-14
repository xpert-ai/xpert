import { SharedModule, StorageFileModule } from '@xpert-ai/server-core'
import { BullModule } from '@nestjs/bull'
import { Module, forwardRef } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from '@nestjs/core'
import { CommandHandlers } from './commands/handlers'
import { ChatConversationController } from './conversation.controller'
import { ChatConversation } from './conversation.entity'
import { ChatConversationReadState } from './conversation-read-state.entity'
import { ChatConversationService } from './conversation.service'
import { ChatConversationGoal, ChatConversationGoalService } from './goal'
import { QueryHandlers } from './queries/handlers'
import { ConversationSummaryProcessor } from './summary.job'
import { ChatMessageModule } from '../chat-message/chat-message.module'
import { ExecutionCancelModule } from '../shared'
import { SseStreamModule } from '../shared/stream'
import { XpertAgentExecutionModule } from '../xpert-agent-execution'
import { SuperAdminOrganizationScopeModule } from '../shared/super-admin-organization-scope.module'
import { ChatTaskSummaryService } from './task-summary.service'
import { XpertAgent } from '../xpert-agent/xpert-agent.entity'

@Module({
    imports: [
        RouterModule.register([{ path: '/chat-conversation', module: ChatConversationModule }]),
        TypeOrmModule.forFeature([ChatConversation, ChatConversationGoal, ChatConversationReadState, XpertAgent]),
        SharedModule,
        CqrsModule,

        BullModule.registerQueue({
            name: 'conversation-summary'
        }),
        forwardRef(() => StorageFileModule),
        forwardRef(() => ChatMessageModule),
        ExecutionCancelModule,
        SuperAdminOrganizationScopeModule,
        XpertAgentExecutionModule,
        SseStreamModule
    ],
    controllers: [ChatConversationController],
    providers: [
        ChatConversationService,
        ChatConversationGoalService,
        ChatTaskSummaryService,
        ConversationSummaryProcessor,
        ...CommandHandlers,
        ...QueryHandlers
    ],
    exports: [ChatConversationService, ChatConversationGoalService, ChatTaskSummaryService]
})
export class ChatConversationModule {}
