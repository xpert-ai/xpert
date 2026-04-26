import { Module } from '@nestjs/common'
import { RouterModule } from '@nestjs/core'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { HandoffQueueModule } from '../handoff/message-queue.module'
import { ProjectCoreModule } from '../project-core/project-core.module'
import { ProjectSprint } from '../project-sprint/project-sprint.entity'
import { ProjectSwimlane } from '../project-swimlane/project-swimlane.entity'
import { ProjectTaskExecution } from '../project-task/project-task-execution.entity'
import { ProjectTask } from '../project-task/project-task.entity'
import { ProjectTeamBinding } from '../team-binding/project-team-binding.entity'
import { TeamDefinitionModule } from '../team-definition/team-definition.module'
import { ProjectOrchestratorController } from './project-orchestrator.controller'
import { ProjectOrchestratorService } from './project-orchestrator.service'
import { ProjectTaskAssignmentService } from './project-task-assignment.service'
import { ProjectTaskDispatchProcessor } from './project-task-dispatch.processor'

@Module({
	imports: [
		RouterModule.register([{ path: '/project-orchestrator', module: ProjectOrchestratorModule }]),
		TypeOrmModule.forFeature([ProjectSprint, ProjectSwimlane, ProjectTask, ProjectTaskExecution, ProjectTeamBinding]),
		CqrsModule,
		ProjectCoreModule,
		TeamDefinitionModule,
		HandoffQueueModule
	],
	controllers: [ProjectOrchestratorController],
	providers: [ProjectOrchestratorService, ProjectTaskAssignmentService, ProjectTaskDispatchProcessor],
	exports: [ProjectOrchestratorService]
})
export class ProjectOrchestratorModule {}
