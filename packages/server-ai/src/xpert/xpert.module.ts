import { AssistantMiddlewareAccessService } from './middleware-access/assistant-middleware-access.service'
import { ResolvePublishedAgentHandler } from './published-agent/resolve-published-agent.query'
import { PublishedAgentContextHandler } from './published-agent/published-agent-context.query'
import { AssistantSharingModule } from './sharing/sharing.module'
import { AssistantSharingController } from './sharing/sharing.controller'
import { TemplateAuthoring } from './template-lifecycle/template-authoring'
import { XpertPublicationPersistence } from './publication/publication-persistence'
import { XpertPublicationController } from './publication/publication.controller'
import { TemplatePublicationService } from './template-lifecycle/template-publication.service'
import { TemplateUpgradeService } from './template-lifecycle/template-upgrade.service'
import { TemplateLifecycleController } from './template-lifecycle/template-lifecycle.controller'
import { AssistantTemplateSetupController } from './template-setup/template-setup.controller'
import { AssistantTemplateSetupService } from './template-setup/template-setup.service'
import { InitializeAssistantTemplateFilesHandler } from './assistant-files/initialize-assistant-template-files.command'
import { AssistantConfigurationController } from './configuration/assistant-configuration.controller'
import { AssistantAppearanceController } from './assistant-appearance/assistant-appearance.controller'
import { AssistantAppearanceService } from './assistant-appearance/assistant-appearance.service'
import { AssistantConfigurationService } from './configuration/assistant-configuration.service'
import { AssistantTriggerController } from './configuration/assistant-trigger.controller'
import { AssistantTriggerService } from './configuration/assistant-trigger.service'
import { forwardRef, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DiscoveryModule, RouterModule } from '@nestjs/core'
import {
    BusinessArea,
    IntegrationModule,
    RedisModule,
    SecretTokenModule,
    TenantModule,
    UserGroupModule,
    UserModule
} from '@xpert-ai/server-core'
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
import { CopilotUsageModule } from '../copilot-usage/copilot-usage.module'
import { AnonymousStrategy } from './auth/anonymous.strategy'
import { EnvironmentModule } from '../environment'
import { WorkflowTriggerRegistry } from '@xpert-ai/plugin-sdk'
import { SandboxModule } from '../sandbox/sandbox.module'
import { HandoffQueueModule } from '../handoff/message-queue.module'
import { XpertTriggerBootstrapRecoveryService } from './jobs/trigger-bootstrap-recovery.service'
import { XpertAuthoringMiddleware } from './middlewares/xpert-authoring.middleware'
import { XpertAuthoringService } from './middlewares/xpert-authoring.service'
import { XpertToolsetModule } from '../xpert-toolset'
import { XpertProfileController } from './xpert-profile.controller'
import { XpertTagUsageController } from './xpert-tag-usage.controller'
import { XpertProfileIndicatorsService } from './xpert-profile-indicators.service'
import { XpertProfileIdentityService } from './xpert-profile-identity.service'
import { AssistantBindingModule } from '../assistant-binding/assistant-binding.module'
import { AgentViewHostDefinition } from '../view-extension/hosts/agent-view-host.definition'
import { ViewMiddlewareRuntimeService } from '../view-extension/view-middleware-runtime.service'
import { AgentMiddlewareRuntimeModule } from '../shared/agent/middleware-runtime/middleware-runtime.module'
import { SkillPackageModule } from '../skill-package'
import { XpertTemplateModule } from '../xpert-template/xpert-template.module'
import { PromptWorkflowModule } from '../prompt-workflow'
import { RuntimeCapabilitiesService } from './runtime-capabilities/runtime-capabilities.service'
import { RuntimeCommandService } from './runtime-capabilities/runtime-command.service'
import { SseStreamModule } from '../shared/stream'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { ChatConversationModule } from '../chat-conversation'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { XpertFrequentQuestionCache } from './xpert-frequent-question-cache.entity'
import { XpertFrequentQuestionsService } from './xpert-frequent-questions.service'
import { XpertPrincipalService } from './xpert-principal.service'
import { ScheduleTriggerStrategies } from './plugins'
import { XpertTemplateWorkspaceInitializer } from './template-workspace-initializer.service'
import { ModelAccessModule } from '../model-access'
import { XpertModelAccessValidator } from './model-access-validator'
import { XpertWorkspaceFilesService } from './xpert-workspace-files.service'
import { AssistantFilesService } from './assistant-files/assistant-files.service'
import { AssistantFileAccessService } from './assistant-files/assistant-file-access.service'
import { AssistantUserPreference } from './assistant-user-preference.entity'
import { AssistantUserPreferenceService } from './assistant-user-preference.service'
import { AssistantModelSelectionService } from './assistant-model-selection.service'
import { XpertProjectModule } from '../xpert-project/project.module'
import { WorkspaceFilesRuntimeModule } from '../shared/runtime/workspace-files-runtime.module'
import { XpertTriggerConnectionController } from './trigger-connection.controller'
import { XpertTriggerConnectionService } from './trigger-connection.service'
import { ApplicationRuntimeModule } from '../plugin-resource/application-runtime.module'

@Module({
    imports: [
        RouterModule.register([{ path: '/xpert', module: XpertModule }]),
        TypeOrmModule.forFeature([
            Xpert,
            BusinessArea,
            ChatConversation,
            ChatMessage,
            XpertFrequentQuestionCache,
            AssistantUserPreference
        ]),
        AssistantSharingModule,
        DiscoveryModule,
        IntegrationModule,
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
        ModelAccessModule,
        WorkspaceFilesRuntimeModule,
        AgentMiddlewareRuntimeModule,
        ApplicationRuntimeModule,
        SandboxModule,
        CopilotCheckpointModule,
        CopilotStoreModule,
        CopilotUsageModule,
        HandoffQueueModule,
        forwardRef(() => ChatConversationModule),
        SseStreamModule,
        forwardRef(() => XpertProjectModule)
    ],
    controllers: [
        AssistantSharingController,
        XpertPublicationController,
        TemplateLifecycleController,
        AssistantTemplateSetupController,
        AssistantTriggerController,
        AssistantConfigurationController,
        AssistantAppearanceController,
        XpertTriggerConnectionController,
        XpertProfileController,
        XpertTagUsageController,
        XpertController,
        XpertAccessController
    ],
    providers: [
        ResolvePublishedAgentHandler,
        PublishedAgentContextHandler,
        XpertPublicationPersistence,
        TemplateAuthoring,
        TemplatePublicationService,
        TemplateUpgradeService,
        AssistantTemplateSetupService,
        InitializeAssistantTemplateFilesHandler,
        AssistantAppearanceService,
        AssistantTriggerService,
        AssistantConfigurationService,
        XpertService,
        XpertTriggerConnectionService,
        XpertTriggerBootstrapRecoveryService,
        AnonymousStrategy,
        WorkflowTriggerRegistry,
        AgentViewHostDefinition,
        ViewMiddlewareRuntimeService,
        XpertProfileIdentityService,
        XpertProfileIndicatorsService,
        XpertAuthoringService,
        XpertAuthoringMiddleware,
        XpertPrincipalService,
        RuntimeCommandService,
        RuntimeCapabilitiesService,
        XpertFrequentQuestionsService,
        XpertTemplateWorkspaceInitializer,
        XpertModelAccessValidator,
        XpertWorkspaceFilesService,
        AssistantFilesService,
        AssistantUserPreferenceService,
        AssistantModelSelectionService,
        AssistantFileAccessService,
        AssistantMiddlewareAccessService,
        ...ScheduleTriggerStrategies,
        ...CommandHandlers,
        ...QueryHandlers
    ],
    exports: [
        AssistantSharingModule,
        XpertWorkspaceFilesService,
        AssistantFilesService,
        XpertService,
        XpertPrincipalService,
        XpertProfileIdentityService,
        XpertTemplateWorkspaceInitializer,
        AssistantUserPreferenceService,
        AssistantModelSelectionService
    ]
})
export class XpertModule {}
