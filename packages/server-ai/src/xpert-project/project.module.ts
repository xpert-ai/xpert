import { ProjectPipelineRuntimeBridgeService } from './pipeline/runtime/pipeline-runtime-bridge.service'
import { ProjectPipelineModelBudgetStore } from './pipeline/budget/pipeline-model-budget.store'
import {
    AuthorizePipelineNativeExecutionHandler,
    PreparePipelineNativeExecutionHandler,
    ProjectPipelineNativeGrantStore
} from './pipeline/runtime/pipeline-native-grant.handler'
import {
    AdmitPipelineModelCallHandler,
    SettlePipelineModelCallHandler
} from './pipeline/budget/pipeline-model-budget.handler'
import { ProjectTaskDispatchRecoveryService } from './runtime/project-task-dispatch-recovery.service'
import { ProjectRuntimeObservationHandler } from './runtime/project-runtime-observation.handler'
import { ProjectTaskCardProvider } from './runtime/project-task-card.provider'
import { AgentInvocationModule } from '../agent-invocation/agent-invocation.module'
import { XpertAgentExecution } from '../xpert-agent-execution/agent-execution.entity'
import { ProjectTaskRuntimeContextService } from './runtime/project-task-runtime-context.service'
import { ProjectTaskDispatchService } from './runtime/project-task-dispatch.service'
import { ProjectTaskRuntimeReadService } from './runtime/project-task-runtime-read.service'
import { ProjectTaskRuntimeHandlers } from './runtime/project-task-runtime.handlers'
import { DiscoveryModule } from '@nestjs/core'
import { ProjectTypeProviderRegistry, ProjectTaskProviderRegistry } from '@xpert-ai/plugin-sdk'
import { PluginApplicationInstallation } from '../plugin-resource/plugin-application-installation.entity'
import { XpertProjectTypeService } from './services/project-type.service'
import { ConversationProjectService } from './services/conversation-project.service'
import { ProjectResourceCardService } from './services/project-resource-card.service'
import { ProjectProvisioningRuntimeService } from './services/project-provisioning-runtime.service'
import { FileAsset } from '../file-understanding/entities/file-asset.entity'
import { XpertProjectPurgeService } from './services/project-purge.service'
import {
    Feature,
    FeatureOrganization,
    FeatureModule,
    IntegrationModule,
    RedisModule,
    TenantModule,
    User,
    UserOrganization,
    Organization,
    UserOrganizationModule,
    UserModule,
    OrganizationModule,
    EmailModule
} from '@xpert-ai/server-core'
import { Module, forwardRef } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from '@nestjs/core'
import { XpertProject } from './entities/project.entity'
import { XpertProjectController } from './project.controller'
import { XpertProjectService } from './project.service'
import { XpertProjectTask } from './entities/project-task.entity'
import { XpertProjectTaskStep } from './entities/project-task-step.entity'
import { XpertProjectTaskLog } from './entities/project-task-log.entity'
import { XpertProjectPlan } from './entities/project-plan.entity'
import { XpertProjectMilestone } from './entities/project-milestone.entity'
import { XpertProjectActivity } from './entities/project-activity.entity'
import { XpertProjectAsset } from './entities/project-asset.entity'
import { XpertProjectAutomation } from './entities/project-automation.entity'
import { XpertProjectAutomationRun } from './entities/project-automation-run.entity'
import { XpertProjectTaskConversation } from './entities/project-task-conversation.entity'
import { XpertProjectTaskExecution } from './entities/project-task-execution.entity'
import { XpertProjectSprint } from './entities/project-sprint.entity'
import { XpertProjectSwimlane } from './entities/project-swimlane.entity'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { CommandHandlers } from './commands/handlers'
import {
    XpertProjectActivityService,
    XpertProjectAssetService,
    XpertProjectAutomationService,
    XpertProjectAutomationSchedulerService,
    XpertProjectAutomationProcessor,
    XpertProjectPlanService,
    XpertProjectTaskService
} from './services'
import { VcsService } from './services/vcs-service'
import { ProjectViewHostDefinition } from '../view-extension/hosts/project-view-host.definition'
import { XpertProjectFeatureGuard, XpertProjectOwnerGuard, XpertProjectPermissionGuard } from './guards'
import { XpertProjectMembership } from './entities/project-membership.entity'
import { XpertProjectInvitation } from './entities/project-invitation.entity'
import { XpertTask } from '../xpert-task/xpert-task.entity'
import { XpertModule } from '../xpert/xpert.module'
import { XpertProjectContentService } from './services/project-content.service'
import { XpertProjectMembershipService } from './services/project-membership.service'
import { XpertProjectInvitationService } from './services/project-invitation.service'
import { XpertProjectWorkspaceFilesService } from './services/project-workspace-files.service'
import { XpertProjectInvitationController } from './project-invitation.controller'
import { XpertProjectAccessModule } from './project-access.module'
import { ConnectorModule } from '../connector/connector.module'
import { XpertProjectAdminController } from './project-admin.controller'
import { SkillRepositoryModule, SkillRepositoryIndexModule } from '../skill-repository'
import { XpertAgentModule } from '../xpert-agent'

import { ProjectTaskGraphController } from './project-task-graph.controller'
import { ProjectTaskGraphService } from './services/project-task-graph.service'
import { ProjectTaskProjectionCoordinator } from './services/task-projection/project-task-projection.coordinator'
import { ProjectTaskProjectionStore } from './services/task-projection/project-task-projection.store'
import { ProjectTaskProjectionService } from './services/task-projection/project-task-projection.service'
import { ProjectTasksViewProvider } from './views/project-tasks.provider'
import { ProjectTasksMiddleware } from './plugins/project-tasks/project-tasks.middleware'
import { ProjectTasksCapabilityProvider } from './plugins/project-tasks/project-tasks.capability'
import { ProjectTaskDecisionService } from './runtime/project-task-decision.service'
import { ProjectPipelineContributionRegistry, ProjectPipelineRuntimeAdapterRegistry } from '@xpert-ai/plugin-sdk'
import { ProjectPipelineEvidenceAccessService } from './pipeline/runtime/pipeline-evidence-access.service'
import { ProjectPipelineConfigurationController } from './pipeline/configuration/project-pipeline-configuration.controller'
import { ProjectPipelineConfigurationService } from './pipeline/configuration/project-pipeline-configuration.service'
import { ProjectPipelineCatalogController } from './pipeline/configuration/pipeline-catalog.controller'
import { ProjectPipelineCatalogService } from './pipeline/configuration/pipeline-catalog.service'
import { ProjectPipelineBindingsService } from './pipeline/configuration/pipeline-bindings.service'
import { ProjectPipelineProjectionProviderRegistry } from '@xpert-ai/plugin-sdk'
import { ProjectPipelineRefreshStore } from './pipeline/projection/pipeline-refresh.store'
import { ProjectPipelineEntities } from './pipeline/persistence/pipeline.entity'
import { ProjectPipelineSchemaService } from './pipeline/persistence/pipeline-schema.service'
import { ProjectPipelineProjectionStore } from './pipeline/projection/pipeline-projection.store'
import { ProjectPipelineProjectionService } from './pipeline/projection/pipeline-projection.service'
import { ProjectPipelineQueryService } from './pipeline/queries/pipeline-query.service'
import { ProjectPipelineAnalyticsService } from './pipeline/queries/pipeline-analytics.service'
import { ProjectPipelinePortfolioController } from './pipeline/queries/pipeline-portfolio.controller'
import { ProjectPipelinePortfolioService } from './pipeline/queries/pipeline-portfolio.service'
import { ProjectPipelineAnalyticsController } from './pipeline/queries/pipeline-analytics.controller'
import { ProjectPipelineController } from './pipeline/queries/pipeline.controller'
import { ProjectPipelineCommandsController } from './pipeline/runtime/pipeline-commands.controller'
import { ProjectPipelineCommandsService } from './pipeline/runtime/pipeline-commands.service'
import { ProjectPipelineManagedStartService } from './pipeline/runtime/pipeline-managed-start.service'
import { ProjectPipelineCoordinatorService } from './pipeline/runtime/pipeline-coordinator.service'
import { ProjectPipelineOperationStore } from './pipeline/runtime/pipeline-operation.store'
import { ProjectPipelineOperationRunnerService } from './pipeline/runtime/pipeline-operation-runner.service'
import { ProjectPipelineOperationObserverService } from './pipeline/runtime/pipeline-operation-observer.service'
import { ProjectPipelineOperationWorkerService } from './pipeline/runtime/pipeline-operation-worker.service'
import { ProjectPipelineEvidenceService } from './pipeline/runtime/pipeline-evidence.service'
import { ProjectPipelineDecisionService } from './pipeline/runtime/pipeline-decision.service'
import { ProjectPipelineBuiltinAdapters } from './pipeline/runtime/pipeline-builtin-adapters'
import { ProjectPipelineRoundService } from './pipeline/runtime/pipeline-round.service'
import { ProjectPipelineLifecycleService } from './pipeline/runtime/pipeline-lifecycle.service'
import { AuthorizeProjectPipelineRuntimeHandler } from './pipeline/runtime/pipeline-runtime-access.handler'
import { ProjectPipelineAssistantBridgeService } from './pipeline/runtime/pipeline-assistant-bridge.service'
import { ProjectPipelineProviderActionStore } from './pipeline/provider-actions/provider-action.store'
import { ProjectPipelineProviderActionsService } from './pipeline/provider-actions/provider-actions.service'
import { ProjectPipelineProviderActionWorkerService } from './pipeline/provider-actions/provider-action-worker.service'
import { ProjectPipelineProviderActionsController } from './pipeline/provider-actions/provider-actions.controller'

@Module({
    imports: [
        DiscoveryModule,
        AgentInvocationModule,
        RouterModule.register([{ path: '/xpert-project', module: XpertProjectModule }]),
        TypeOrmModule.forFeature([
            ...ProjectPipelineEntities,
            PluginApplicationInstallation,
            FileAsset,
            XpertProject,
            XpertProjectTask,
            XpertProjectTaskStep,
            XpertProjectTaskLog,
            XpertProjectPlan,
            XpertProjectMilestone,
            XpertProjectActivity,
            XpertProjectAsset,
            XpertProjectAutomation,
            XpertProjectAutomationRun,
            XpertProjectTaskConversation,
            XpertProjectTaskExecution,
            XpertAgentExecution,
            XpertProjectSprint,
            XpertProjectSwimlane,
            ChatConversation,
            XpertTask,
            XpertProjectMembership,
            XpertProjectInvitation,
            User,
            UserOrganization,
            Organization,
            Feature,
            FeatureOrganization
        ]),
        TenantModule,
        RedisModule,
        FeatureModule,
        CqrsModule,
        IntegrationModule,
        UserModule,
        UserOrganizationModule,
        OrganizationModule,
        EmailModule,
        ConnectorModule,
        forwardRef(() => SkillRepositoryModule),
        forwardRef(() => SkillRepositoryIndexModule),
        XpertProjectAccessModule,
        forwardRef(() => XpertAgentModule),
        forwardRef(() => XpertModule)
    ],
    controllers: [
        ProjectPipelineCommandsController,
        ProjectPipelineController,
        ProjectPipelineAnalyticsController,
        ProjectPipelinePortfolioController,
        ProjectPipelineConfigurationController,
        ProjectPipelineCatalogController,
        ProjectPipelineProviderActionsController,
        XpertProjectController,
        XpertProjectInvitationController,
        XpertProjectAdminController,
        ProjectTaskGraphController
    ],
    providers: [
        ProjectPipelineSchemaService,
        ProjectPipelineModelBudgetStore,
        AuthorizePipelineNativeExecutionHandler,
        PreparePipelineNativeExecutionHandler,
        ProjectPipelineNativeGrantStore,
        AdmitPipelineModelCallHandler,
        SettlePipelineModelCallHandler,
        ProjectPipelineProviderActionStore,
        ProjectPipelineProviderActionsService,
        ProjectPipelineProviderActionWorkerService,
        ProjectPipelineAssistantBridgeService,
        ProjectPipelineRuntimeBridgeService,
        AuthorizeProjectPipelineRuntimeHandler,
        ProjectPipelineRoundService,
        ProjectPipelineLifecycleService,
        ...ProjectPipelineBuiltinAdapters,
        ProjectPipelineCommandsService,
        ProjectPipelineManagedStartService,
        ProjectPipelineCoordinatorService,
        ProjectPipelineOperationStore,
        ProjectPipelineOperationRunnerService,
        ProjectPipelineOperationObserverService,
        ProjectPipelineOperationWorkerService,
        ProjectPipelineEvidenceService,
        ProjectPipelineDecisionService,
        ProjectPipelineRefreshStore,
        ProjectPipelineProjectionProviderRegistry,
        ProjectPipelineProjectionStore,
        ProjectPipelineProjectionService,
        ProjectPipelineQueryService,
        ProjectPipelineAnalyticsService,
        ProjectPipelinePortfolioService,
        ProjectPipelineContributionRegistry,
        ProjectPipelineRuntimeAdapterRegistry,
        ProjectPipelineEvidenceAccessService,
        ProjectPipelineConfigurationService,
        ProjectPipelineCatalogService,
        ProjectPipelineBindingsService,
        ProjectTaskDecisionService,
        ProjectTaskDispatchRecoveryService,
        ProjectRuntimeObservationHandler,
        ProjectTaskCardProvider,
        ProjectTasksMiddleware,
        ProjectTasksCapabilityProvider,
        ProjectTaskRuntimeContextService,
        ProjectTaskDispatchService,
        ProjectTaskRuntimeReadService,
        ...ProjectTaskRuntimeHandlers,
        ProjectResourceCardService,
        ConversationProjectService,
        ProjectTypeProviderRegistry,
        ProjectTaskProviderRegistry,
        ProjectTaskGraphService,
        ProjectTaskProjectionCoordinator,
        ProjectTaskProjectionStore,
        ProjectTaskProjectionService,
        ProjectTasksViewProvider,
        XpertProjectTypeService,
        ProjectProvisioningRuntimeService,
        XpertProjectPurgeService,
        XpertProjectService,
        XpertProjectContentService,
        XpertProjectMembershipService,
        XpertProjectInvitationService,
        XpertProjectWorkspaceFilesService,
        XpertProjectTaskService,
        XpertProjectPlanService,
        XpertProjectActivityService,
        XpertProjectAssetService,
        XpertProjectAutomationService,
        XpertProjectAutomationSchedulerService,
        XpertProjectAutomationProcessor,
        VcsService,
        ProjectViewHostDefinition,
        XpertProjectFeatureGuard,
        XpertProjectOwnerGuard,
        XpertProjectPermissionGuard,
        ...CommandHandlers
    ],
    exports: [
        XpertProjectTypeService,
        XpertProjectWorkspaceFilesService,
        XpertProjectFeatureGuard,
        ProjectResourceCardService,
        XpertProjectService,
        XpertProjectAccessModule,
        XpertProjectContentService,
        XpertProjectMembershipService,
        ConversationProjectService
    ]
})
export class XpertProjectModule {}
