import { TenantModule } from '@xpert-ai/server-core'
import { Module } from '@nestjs/common'
import { RouterModule } from '@nestjs/core'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ProjectSprint } from '../project-sprint/project-sprint.entity'
import { ProjectSwimlane } from '../project-swimlane/project-swimlane.entity'
import { ProjectTaskController } from './project-task.controller'
import { ProjectTask } from './project-task.entity'
import { ProjectTaskService } from './project-task.service'

@Module({
	imports: [
		RouterModule.register([{ path: '/project-task', module: ProjectTaskModule }]),
		TypeOrmModule.forFeature([ProjectTask, ProjectSprint, ProjectSwimlane]),
		TenantModule
	],
	controllers: [ProjectTaskController],
	providers: [ProjectTaskService],
	exports: [ProjectTaskService]
})
export class ProjectTaskModule {}
