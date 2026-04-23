import { TenantModule } from '@xpert-ai/server-core'
import { Module } from '@nestjs/common'
import { RouterModule } from '@nestjs/core'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ChatConversationModule } from '../chat-conversation'
import { HandoffQueueModule } from '../handoff/message-queue.module'
import { ProjectCoreModule } from '../project-core/project-core.module'
import { ProjectOrchestratorModule } from '../project-orchestrator/project-orchestrator.module'
import { ProjectSprint } from '../project-sprint/project-sprint.entity'
import { ProjectSprintModule } from '../project-sprint/project-sprint.module'
import { ProjectSwimlane } from '../project-swimlane/project-swimlane.entity'
import { ProjectSwimlaneModule } from '../project-swimlane/project-swimlane.module'
import { ProjectTask } from '../project-task/project-task.entity'
import { ProjectTaskModule } from '../project-task/project-task.module'
import { TeamBindingModule } from '../team-binding/team-binding.module'
import { TeamDefinitionModule } from '../team-definition/team-definition.module'
import { XpertModule } from '../xpert'
import { ProjectAssistantController } from './project-assistant.controller'
import { ProjectManagementMiddleware } from './middlewares/project-management.middleware'
import { ProjectAssistantActionService } from './services/project-assistant-action.service'
import { ProjectAssistantService } from './services/project-assistant.service'

@Module({
	imports: [
		RouterModule.register([{ path: '/project-assistant', module: ProjectAssistantModule }]),
		TypeOrmModule.forFeature([ProjectSprint, ProjectSwimlane, ProjectTask]),
		CqrsModule,
		TenantModule,
		ProjectCoreModule,
		ProjectSprintModule,
		ProjectSwimlaneModule,
		ProjectTaskModule,
		ProjectOrchestratorModule,
		TeamDefinitionModule,
		TeamBindingModule,
		XpertModule,
		ChatConversationModule,
		HandoffQueueModule
	],
	controllers: [ProjectAssistantController],
	providers: [ProjectManagementMiddleware, ProjectAssistantService, ProjectAssistantActionService],
	exports: [ProjectManagementMiddleware, ProjectAssistantService, ProjectAssistantActionService]
})
export class ProjectAssistantModule {}
