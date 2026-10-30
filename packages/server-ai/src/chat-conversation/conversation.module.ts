import { ThreadControlProjection } from './control-view/thread-control-projection.entity'
import { ThreadControlViewService } from './control-view/thread-control-view.service'
import { ReadThreadControlViewHandler } from './control-view/read-thread-control-view.handler'
import { TaskControlModule } from '@xpert-ai/server-core'
import { ThreadRecoveryService } from './recovery/thread-recovery.service'
import { ChatExecutionAdmissionService } from './chat-execution-admission.service'
import { ArtifactsModule } from '../artifacts/artifacts.module'
import { FileChangeStatsService } from './file-change-stats.service'
import { RedisModule, SharedModule, StorageFileModule } from '@xpert-ai/server-core'
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
import { ExecutionControlModule } from '../execution-control/execution-control.module'
import { SseStreamModule } from '../shared/stream'
import { XpertAgentExecutionModule } from '../xpert-agent-execution'
import { SuperAdminOrganizationScopeModule } from '../shared/super-admin-organization-scope.module'
import { ChatTaskSummaryService } from './task-summary.service'
import { XpertAgent } from '../xpert-agent/xpert-agent.entity'
import { ChatConversationThread } from './conversation-thread.entity'
import { ChatConversationThreadService } from './conversation-thread.service'
import { ThreadRunControlService } from './thread-run-control.service'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { CopilotCheckpoint } from '../copilot-checkpoint/copilot-checkpoint.entity'
import { CopilotCheckpointWrites } from '../copilot-checkpoint/writes/writes.entity'
import { XpertProjectAccessModule } from '../xpert-project/project-access.module'
import { WorkbenchAssistantConversationNavigationService } from './workbench-assistant-conversation-navigation.service'
import { AssistantUserPreference } from '../xpert/assistant-user-preference.entity'
import { ChatConversationSidebarController } from './conversation-sidebar.controller'
import { ChatConversationSidebarService } from './conversation-sidebar.service'
import { MessageCheckpointService } from './message-checkpoint.service'
import { ConversationAgentRunsService } from '../ai/conversation-agent-runs.service'
import { ThreadReferenceService } from './thread-reference.service'
import { ThreadCursorStore } from './thread-cursor.store'
import { ConversationInitializerRegistry } from './conversation-initializer.registry'
import { SideChatForkService } from './side-chat-fork.service'
import { CopilotCheckpointModule } from '../copilot-checkpoint/copilot-checkpoint.module'
import { ContextEvidence } from './context-evidence/context-evidence.entity'
import { ContextEvidenceService } from './context-evidence/context-evidence.service'
import { ContextEvidenceStorage } from './context-evidence/context-evidence.schema'
import { DatabaseContextEvidenceStorage } from './context-evidence/context-evidence.storage'
import { ConversationEnvironmentFilesModule } from './workspace-files/conversation-environment-files.module'

@Module({
    imports: [
        ConversationEnvironmentFilesModule,
        TaskControlModule,
        RouterModule.register([{ path: '/chat-conversation', module: ChatConversationModule }]),
        TypeOrmModule.forFeature([
            ContextEvidence,
            ThreadControlProjection,
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
        forwardRef(() => ArtifactsModule),
        SharedModule,
        RedisModule,
        CqrsModule,
        CopilotCheckpointModule,

        BullModule.registerQueue({
            name: 'conversation-summary'
        }),
        forwardRef(() => StorageFileModule),
        forwardRef(() => ChatMessageModule),
        ExecutionControlModule,
        SuperAdminOrganizationScopeModule,
        XpertAgentExecutionModule,
        SseStreamModule,
        XpertProjectAccessModule
    ],
    controllers: [ChatConversationSidebarController, ChatConversationController],
    providers: [
        ContextEvidenceService,
        { provide: ContextEvidenceStorage, useClass: DatabaseContextEvidenceStorage },
        ThreadControlViewService,
        ReadThreadControlViewHandler,
        ChatExecutionAdmissionService,
        ConversationInitializerRegistry,
        ThreadCursorStore,
        ThreadReferenceService,
        ConversationAgentRunsService,
        MessageCheckpointService,
        ChatConversationService,
        ChatConversationSidebarService,
        ChatConversationThreadService,
        SideChatForkService,
        ThreadRunControlService,
        ThreadRecoveryService,
        ChatConversationGoalService,
        ChatTaskSummaryService,
        FileChangeStatsService,
        WorkbenchAssistantConversationNavigationService,
        ConversationSummaryProcessor,
        ...CommandHandlers,
        ...QueryHandlers
    ],
    exports: [
        ContextEvidenceService,
        ChatExecutionAdmissionService,
        ConversationInitializerRegistry,
        ThreadReferenceService,
        MessageCheckpointService,
        ThreadRunControlService,
        ThreadRecoveryService,
        ChatConversationService,
        ChatConversationThreadService,
        ChatConversationGoalService,
        ChatTaskSummaryService,
        WorkbenchAssistantConversationNavigationService
    ]
})
export class ChatConversationModule {}
