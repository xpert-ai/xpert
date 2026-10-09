import { GROUP_CONTROLLERS } from './groups'
import { GroupScopeGuard } from './groups/group-scope.guard'
import { ChatGroupModule } from '../chat-group/chat-group.module'
import { ThreadActivityService } from './thread-activity/thread-activity.service'
import { ConversationArtifactsController } from './conversation-artifacts.controller'
import { VoiceController, VoiceCapabilityController } from './voice.controller'
import { VoiceSessionService } from '../realtime-voice/voice-session.service'
import { VoiceTaskService } from '../realtime-voice/voice-task.service'
import { VoiceTaskProcessor } from '../realtime-voice/voice-task.processor'
import { VoiceGateway } from '../realtime-voice/voice.gateway'
import { RealtimeVoiceSession, RealtimeVoiceTask, RealtimeVoiceTurn } from '../realtime-voice/voice.entity'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { XpertAgentExecution } from '../xpert-agent-execution/agent-execution.entity'
import { AssistantWorkspaceFilesController } from './assistant-workspace-files.controller'
import { WorkspaceFileAccessRuntimeController } from './workspace-file-access-runtime.controller'
import { AssistantFileAccessGuard } from './assistant-file-access.guard'
import { WorkspaceFileAccessModule } from '../workspace-file-access/workspace-file-access.module'
import { WorkbenchFilesController } from './workbench-files.controller'
import { WorkbenchFilesAuthGuard } from './workbench-files-auth.guard'
import { McpAppsRuntimeController } from './mcp-apps-runtime.controller'
import { XpertToolsetModule } from '../xpert-toolset/xpert-toolset.module'
import { RedisModule, SecretTokenModule, StorageFileModule, TenantModule } from '@xpert-ai/server-core'
import { forwardRef, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { RouterModule } from '@nestjs/core'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CopilotModule } from '../copilot'
import { CopilotOrganizationModule } from '../copilot-organization/index'
import { CopilotUserModule } from '../copilot-user/index'
import { KnowledgebaseModule } from '../knowledgebase'
import { AIV1Controller } from './ai-v1.controller'
import { AIController } from './ai.controller'
import { AiService } from './ai.service'
import { CommandHandlers } from './commands/handlers'
import { QueryHandlers } from './queries/handlers'
import { ThreadsController } from './thread.controller'
import { KnowledgeDocumentModule } from '../knowledge-document'
import { AssistantsController } from './assistant.controller'
import { XpertModule } from '../xpert'
import { StoreController } from './store.controller'
import { ContextsController } from './context.controller'
import { KnowledgesController } from './knowledge.controller'
import { ConversationsController } from './conversation.controller'
import { ChatConversationModule } from '../chat-conversation'
import { ChatMessageModule } from '../chat-message'
import { ChatMessageFeedbackModule } from '../chat-message-feedback'
import { EnvironmentModule } from '../environment'
import { AssistantBindingModule } from '../assistant-binding'
import { XpertAgentModule } from '../xpert-agent'
import { SkillPackageModule } from '../skill-package'
import { PromptWorkflowModule } from '../prompt-workflow'
import { SseStreamModule } from '../shared/stream'
import { XpertProjectModule } from '../xpert-project'
import { FileUnderstandingModule } from '../file-understanding'
import { XpertAgentExecutionModule } from '../xpert-agent-execution/agent-execution.module'
import { ConversationAgentRunsService } from './conversation-agent-runs.service'

import { RuntimeResourceController } from '../agent-plugin/runtime-resource.controller'
import { ConnectorModule } from '../connector/connector.module'
import { ConnectorRuntimeController } from './connector-runtime.controller'
import { ConversationBranchController } from './conversation-branch.controller'
import { CopilotCheckpointModule } from '../copilot-checkpoint/copilot-checkpoint.module'
import { SandboxModule } from '../sandbox/sandbox.module'
import { SandboxRuntimeController } from './sandbox-runtime.controller'
import { AssistantThreadScopeGuard } from './assistant-thread-scope.guard'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { ChatConversationThread } from '../chat-conversation/conversation-thread.entity'
import { SuperAdminOrganizationScopeModule } from '../shared/super-admin-organization-scope.module'

@Module({
    imports: [
        RouterModule.register([
            {
                path: '/ai',
                module: AIModule
            }
        ]),
        ChatGroupModule,
        WorkspaceFileAccessModule,
        TenantModule,
        TypeOrmModule.forFeature([
            ChatConversation,
            ChatConversationThread,
            ChatMessage,
            XpertAgentExecution,
            RealtimeVoiceSession,
            RealtimeVoiceTask,
            RealtimeVoiceTurn
        ]),
        SandboxModule,
        SuperAdminOrganizationScopeModule,
        CopilotCheckpointModule,
        SecretTokenModule,
        RedisModule,
        CqrsModule,
        ConnectorModule,
        CopilotModule,
        CopilotUserModule,
        CopilotOrganizationModule,
        forwardRef(() => KnowledgebaseModule),
        forwardRef(() => KnowledgeDocumentModule),
        forwardRef(() => StorageFileModule),
        forwardRef(() => XpertModule),
        forwardRef(() => XpertAgentModule),
        forwardRef(() => SkillPackageModule),
        forwardRef(() => PromptWorkflowModule),
        forwardRef(() => AssistantBindingModule),
        forwardRef(() => EnvironmentModule),
        forwardRef(() => ChatConversationModule),
        forwardRef(() => ChatMessageModule),
        forwardRef(() => ChatMessageFeedbackModule),
        forwardRef(() => FileUnderstandingModule),
        SseStreamModule,
        forwardRef(() => XpertAgentExecutionModule),
        XpertProjectModule,
        forwardRef(() => XpertToolsetModule)
    ],
    controllers: [
        ...GROUP_CONTROLLERS,
        ConversationArtifactsController,
        VoiceController,
        VoiceCapabilityController,
        AssistantWorkspaceFilesController,
        WorkspaceFileAccessRuntimeController,
        WorkbenchFilesController,
        McpAppsRuntimeController,
        SandboxRuntimeController,
        ConversationBranchController,
        AIController,
        AIV1Controller,
        ContextsController,
        KnowledgesController,
        AssistantsController,
        RuntimeResourceController,
        ConnectorRuntimeController,
        ThreadsController,
        ConversationsController,
        StoreController
    ],
    providers: [
        GroupScopeGuard,
        ThreadActivityService,
        VoiceSessionService,
        VoiceTaskService,
        VoiceTaskProcessor,
        VoiceGateway,
        AssistantFileAccessGuard,
        WorkbenchFilesAuthGuard,
        AssistantThreadScopeGuard,
        AiService,
        ConversationAgentRunsService,
        ...CommandHandlers,
        ...QueryHandlers
    ]
})
export class AIModule {}
