import { TenantModule } from '@xpert-ai/server-core'
import { Module } from '@nestjs/common'
import { RouterModule } from '@nestjs/core'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ProjectCore } from '../project-core/project-core.entity'
import { ProjectSwimlaneModule } from '../project-swimlane/project-swimlane.module'
import { ProjectSprintController } from './project-sprint.controller'
import { ProjectSprint } from './project-sprint.entity'
import { ProjectSprintService } from './project-sprint.service'

@Module({
	imports: [
		RouterModule.register([{ path: '/project-sprint', module: ProjectSprintModule }]),
		TypeOrmModule.forFeature([ProjectSprint, ProjectCore]),
		TenantModule,
		ProjectSwimlaneModule
	],
	controllers: [ProjectSprintController],
	providers: [ProjectSprintService],
	exports: [ProjectSprintService]
})
export class ProjectSprintModule {}
