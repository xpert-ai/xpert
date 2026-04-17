import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ProjectSprint } from '../project-sprint/project-sprint.entity'
import { ProjectSwimlane } from '../project-swimlane/project-swimlane.entity'
import { ProjectTask } from '../project-task/project-task.entity'
import { ProjectOrchestratorService } from './project-orchestrator.service'

@Module({
	imports: [TypeOrmModule.forFeature([ProjectSprint, ProjectSwimlane, ProjectTask])],
	providers: [ProjectOrchestratorService],
	exports: [ProjectOrchestratorService]
})
export class ProjectOrchestratorModule {}
