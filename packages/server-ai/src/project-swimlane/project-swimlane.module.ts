import { TenantModule } from '@xpert-ai/server-core'
import { Module } from '@nestjs/common'
import { RouterModule } from '@nestjs/core'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ProjectSprint } from '../project-sprint/project-sprint.entity'
import { ProjectSwimlaneController } from './project-swimlane.controller'
import { ProjectSwimlane } from './project-swimlane.entity'
import { ProjectSwimlaneService } from './project-swimlane.service'

@Module({
	imports: [
		RouterModule.register([{ path: '/project-swimlane', module: ProjectSwimlaneModule }]),
		TypeOrmModule.forFeature([ProjectSwimlane, ProjectSprint]),
		TenantModule
	],
	controllers: [ProjectSwimlaneController],
	providers: [ProjectSwimlaneService],
	exports: [ProjectSwimlaneService]
})
export class ProjectSwimlaneModule {}
