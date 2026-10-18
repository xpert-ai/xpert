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

@Module({
    imports: [
        DiscoveryModule,
        AgentInvocationModule,
        RouterModule.register([{ path: '/xpert-project', module: XpertProjectModule }]),
        TypeOrmModule.forFeature([
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
        XpertProjectController,
        XpertProjectInvitationController,
        XpertProjectAdminController,
        ProjectTaskGraphController
    ],
    providers: [
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
