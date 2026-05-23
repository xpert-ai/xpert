import { forwardRef, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DiscoveryModule, RouterModule } from '@nestjs/core'
import { RedisModule, SecretTokenModule, TenantModule, UserGroupModule, UserModule } from '@xpert-ai/server-core'
import { XpertController } from './xpert.controller'
import { XpertAccessController } from './xpert-access.controller'
import { Xpert } from './xpert.entity'
import { XpertService } from './xpert.service'
import { CommandHandlers } from './commands/handlers/index'
import { KnowledgebaseModule } from '../knowledgebase'
import { QueryHandlers } from './queries/handlers'
import { XpertAgentModule } from '../xpert-agent'
import { XpertWorkspaceModule } from '../xpert-workspace'
import { CopilotCheckpointModule } from '../copilot-checkpoint'
import { CopilotStoreModule } from '../copilot-store/copilot-store.module'
import { AnonymousStrategy } from './auth/anonymous.strategy'
import { EnvironmentModule } from '../environment'
import { WorkflowTriggerRegistry } from '@xpert-ai/plugin-sdk'
import { SandboxModule } from '../sandbox/sandbox.module'
import { HandoffQueueModule } from '../handoff/message-queue.module'
import { XpertTriggerBootstrapRecoveryService } from './jobs/trigger-bootstrap-recovery.service'
import { XpertAuthoringMiddleware } from './middlewares/xpert-authoring.middleware'
import { XpertAuthoringService } from './middlewares/xpert-authoring.service'
import { XpertToolsetModule } from '../xpert-toolset'
import { PublishedXpertAccessService } from './published-xpert-access.service'
import { AssistantBindingModule } from '../assistant-binding/assistant-binding.module'
import { AgentViewHostDefinition } from '../view-extension/hosts/agent-view-host.definition'
import { SkillPackageModule } from '../skill-package'
import { XpertTemplateModule } from '../xpert-template/xpert-template.module'
import { PromptWorkflowModule } from '../prompt-workflow'
import { RuntimeCapabilitiesService } from '../ai/runtime-capabilities.service'
import { RuntimeCommandService } from '../ai/runtime-command.service'
import { SseStreamModule } from '../shared/stream'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { XpertFrequentQuestionCache } from './xpert-frequent-question-cache.entity'
import { XpertFrequentQuestionsService } from './xpert-frequent-questions.service'

@Module({
    imports: [
        RouterModule.register([{ path: '/xpert', module: XpertModule }]),
        TypeOrmModule.forFeature([Xpert, ChatConversation, ChatMessage, XpertFrequentQuestionCache]),
        DiscoveryModule,
        TenantModule,
        SecretTokenModule,
        CqrsModule,
        RedisModule,
        forwardRef(() => KnowledgebaseModule),
        forwardRef(() => XpertAgentModule),
        forwardRef(() => XpertToolsetModule),
        forwardRef(() => UserGroupModule),
        forwardRef(() => UserModule),
        forwardRef(() => XpertWorkspaceModule),
        forwardRef(() => EnvironmentModule),
        forwardRef(() => AssistantBindingModule),
        XpertTemplateModule,
        SkillPackageModule,
        PromptWorkflowModule,
        SandboxModule,
        CopilotCheckpointModule,
        CopilotStoreModule,
        HandoffQueueModule,
        SseStreamModule
    ],
    controllers: [XpertController, XpertAccessController],
    providers: [
        XpertService,
        XpertTriggerBootstrapRecoveryService,
        AnonymousStrategy,
        WorkflowTriggerRegistry,
        AgentViewHostDefinition,
        PublishedXpertAccessService,
        XpertAuthoringService,
        XpertAuthoringMiddleware,
        RuntimeCommandService,
        RuntimeCapabilitiesService,
        XpertFrequentQuestionsService,
        ...CommandHandlers,
        ...QueryHandlers
    ],
    exports: [XpertService, PublishedXpertAccessService]
})
export class XpertModule {}
