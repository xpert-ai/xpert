import { UserModule } from '@xpert-ai/server-core'
import { Module, forwardRef } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { AIModule } from './ai'
import { AssistantBindingModule } from './assistant-binding'
import { ChatModule } from './chat'
import { ChatConversationModule } from './chat-conversation'
import { ChatMessageModule } from './chat-message'
import { ChatMessageFeedbackModule } from './chat-message-feedback'
import { CopilotModule } from './copilot'
import { CopilotCheckpointModule } from './copilot-checkpoint'
import { CopilotKnowledgeModule } from './copilot-knowledge'
import { CopilotModelModule } from './copilot-model'
import { CopilotOrganizationModule } from './copilot-organization'
import { CopilotProviderModule } from './copilot-provider'
import { CopilotStoreModule } from './copilot-store/copilot-store.module'
import { CopilotUserModule } from './copilot-user'
import { EventHandlers } from './core/events'
import { GraphragModule } from './graphrag/graphrag.module'
import { KnowledgeDocumentModule } from './knowledge-document/index'
import { KnowledgebaseModule } from './knowledgebase/index'
import { RagWebModule } from './rag-web/rag-web.module'
import { SandboxModule } from './sandbox/sandbox.module'
import { XpertModule } from './xpert'
import { XpertAgentExecutionModule } from './xpert-agent-execution'
import { XpertAgentModule } from './xpert-agent/index'
import { XpertProjectModule } from './xpert-project/project.module'
import { XpertTaskModule } from './xpert-task'
import { XpertTemplateModule } from './xpert-template/xpert-template.module'
import { XpertToolModule } from './xpert-tool/index'
import { XpertToolsetModule } from './xpert-toolset/index'
import { XpertWorkspaceModule } from './xpert-workspace'
import { CommandHandlers } from './shared'
import { RagVStoreModule } from './rag-vstore'
import { EnvironmentModule } from './environment'
import { XpertTableModule } from './xpert-table'
import { HandoffQueueModule } from './handoff/message-queue.module'
import { SkillRepositoryIndexModule, SkillRepositoryModule } from './skill-repository'
import { SkillPackageModule } from './skill-package'
import { FileUploadTargetsModule } from './shared'
import { InitializationModule } from './initialization/initialization.module'
import { TeamBindingModule } from './team-binding/team-binding.module'
import { TeamDefinitionModule } from './team-definition/team-definition.module'
import { ProjectCoreModule } from './project-core/project-core.module'
import { ProjectOrchestratorModule } from './project-orchestrator/project-orchestrator.module'
import { ProjectSprintModule } from './project-sprint/project-sprint.module'
import { ProjectSwimlaneModule } from './project-swimlane/project-swimlane.module'
import { ProjectTaskModule } from './project-task/project-task.module'
import { ProjectAssistantModule } from './project-assistant/project-assistant.module'
import { ViewHostCacheSubscriber } from './view-extension/view-host-cache.subscriber'
import { VolumeModule } from './shared/volume'

@Module({
    imports: [
        forwardRef(() => CqrsModule),
        forwardRef(() => UserModule),
        AssistantBindingModule,
        ChatModule,
        ChatConversationModule,
        ChatMessageModule,
        ChatMessageFeedbackModule,
        CopilotCheckpointModule,
        AIModule,
        CopilotModule,
        CopilotModelModule,
        CopilotKnowledgeModule,
        CopilotUserModule,
        CopilotOrganizationModule,
        CopilotProviderModule,
        CopilotStoreModule,
        EnvironmentModule,
        GraphragModule,
        HandoffQueueModule,
        FileUploadTargetsModule,
        VolumeModule,
        XpertModule,
        XpertAgentModule,
        XpertAgentExecutionModule,
        XpertToolModule,
        XpertToolsetModule,
        XpertWorkspaceModule,
        XpertProjectModule,
        XpertTemplateModule,
        XpertTaskModule,
        XpertTableModule,
        SkillRepositoryModule,
		SkillRepositoryIndexModule,
		SkillPackageModule,
        InitializationModule,
        KnowledgebaseModule,
        KnowledgeDocumentModule,
        RagVStoreModule,
        RagWebModule,
        SandboxModule,
        TeamDefinitionModule,
        TeamBindingModule,
        ProjectCoreModule,
        ProjectSprintModule,
        ProjectSwimlaneModule,
        ProjectTaskModule,
        ProjectOrchestratorModule,
        ProjectAssistantModule
    ],
    controllers: [],
    providers: [...EventHandlers, ...CommandHandlers, ViewHostCacheSubscriber]
})
export class ServerAIModule {}
