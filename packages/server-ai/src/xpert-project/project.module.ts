import {
    Feature,
    FeatureOrganization,
    FeatureModule,
    IntegrationModule,
    RedisModule,
    TenantModule,
    User,
    UserOrganization
} from '@xpert-ai/server-core'
import { forwardRef, Module } from '@nestjs/common'
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
import { XpertProjectFeatureGuard, XpertProjectPermissionGuard } from './guards'
import { XpertWorkspaceModule } from '../xpert-workspace/workspace.module'
import { XpertModule } from '../xpert/xpert.module'
import { XpertProjectMembership } from './entities/project-membership.entity'
import { XpertProjectAccessModule } from './project-access.module'
import { XpertProjectMembershipService } from './services/project-membership.service'
import { XpertProjectOwnerGuard } from './guards/project-owner.guard'

@Module({
    imports: [
        RouterModule.register([{ path: '/xpert-project', module: XpertProjectModule }]),
        TypeOrmModule.forFeature([
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
            Feature,
            FeatureOrganization,
            XpertProjectMembership,
            User,
            UserOrganization
        ]),
        TenantModule,
        RedisModule,
        FeatureModule,
        CqrsModule,
        IntegrationModule,
        XpertWorkspaceModule,
        XpertProjectAccessModule,
        forwardRef(() => XpertModule)
    ],
    controllers: [XpertProjectController],
    providers: [
        XpertProjectService,
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
        XpertProjectPermissionGuard,
        XpertProjectOwnerGuard,
        XpertProjectMembershipService,
        ...CommandHandlers
    ],
    exports: [XpertProjectService, XpertProjectAccessModule, XpertProjectMembershipService]
})
export class XpertProjectModule {}
