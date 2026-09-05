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
    XpertProjectMigrationService,
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
import { XpertProjectAccessService } from './services/project-access.service'
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

@Module({
    imports: [
        RouterModule.register([{ path: '/xpert-project', module: XpertProjectModule }]),
        TypeOrmModule.forFeature([
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
    controllers: [XpertProjectController, XpertProjectInvitationController, XpertProjectAdminController],
    providers: [
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
        XpertProjectMigrationService,
        VcsService,
        ProjectViewHostDefinition,
        XpertProjectFeatureGuard,
        XpertProjectOwnerGuard,
        XpertProjectPermissionGuard,
        ...CommandHandlers
    ],
    exports: [XpertProjectService, XpertProjectAccessModule, XpertProjectContentService, XpertProjectMembershipService]
})
export class XpertProjectModule {}
