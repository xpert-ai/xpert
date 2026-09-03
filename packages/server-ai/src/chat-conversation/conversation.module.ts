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
import { ChatConversationThread } from './conversation-thread.entity'
import { ChatConversationThreadService } from './conversation-thread.service'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { CopilotCheckpoint } from '../copilot-checkpoint/copilot-checkpoint.entity'
import { CopilotCheckpointWrites } from '../copilot-checkpoint/writes/writes.entity'
import { XpertProjectAccessModule } from '../xpert-project/project-access.module'
import { WorkbenchAssistantConversationNavigationService } from './workbench-assistant-conversation-navigation.service'
import { AssistantUserPreference } from '../xpert/assistant-user-preference.entity'
import { ChatConversationSidebarController } from './conversation-sidebar.controller'
import { ChatConversationSidebarService } from './conversation-sidebar.service'

@Module({
    imports: [
        RouterModule.register([{ path: '/chat-conversation', module: ChatConversationModule }]),
        TypeOrmModule.forFeature([
            ChatConversation,
            AssistantUserPreference,
            ChatConversationThread,
            ChatConversationGoal,
            ChatConversationReadState,
            ChatMessage,
            CopilotCheckpoint,
            CopilotCheckpointWrites,
            XpertAgent
        ]),
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
        SseStreamModule,
        XpertProjectAccessModule
    ],
    controllers: [ChatConversationSidebarController, ChatConversationController],
    providers: [
        ChatConversationService,
        ChatConversationSidebarService,
        ChatConversationThreadService,
        ChatConversationGoalService,
        ChatTaskSummaryService,
        WorkbenchAssistantConversationNavigationService,
        ConversationSummaryProcessor,
        ...CommandHandlers,
        ...QueryHandlers
    ],
    exports: [
        ChatConversationService,
        ChatConversationThreadService,
        ChatConversationGoalService,
        ChatTaskSummaryService,
        WorkbenchAssistantConversationNavigationService
    ]
})
export class ChatConversationModule {}
