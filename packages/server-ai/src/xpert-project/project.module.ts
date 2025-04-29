import { TenantModule } from '@metad/server-core'
import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from 'nest-router'
import { XpertProject } from './entities/project.entity'
import { XpertProjectController } from './project.controller'
import { XpertProjectService } from './project.service'
import { XpertProjectTask } from './entities/project-task.entity'
import { XpertProjectTaskStep } from './entities/project-task-step.entity'
import { XpertProjectTaskLog } from './entities/project-task-log.entity'
import { CommandHandlers } from './commands/handlers'
import { XpertProjectFile } from './entities/project-file.entity'
import { XpertProjectTaskService, XpertProjectFileService } from './services'

@Module({
	imports: [
		RouterModule.forRoutes([{ path: '/xpert-project', module: XpertProjectModule }]),
		TypeOrmModule.forFeature([
			XpertProject,
			XpertProjectTask,
			XpertProjectTaskStep,
			XpertProjectTaskLog,
			XpertProjectFile
		]),
		TenantModule,
		CqrsModule,
	],
	controllers: [XpertProjectController],
	providers: [XpertProjectService, XpertProjectTaskService, XpertProjectFileService, ...CommandHandlers],
	exports: [XpertProjectService]
})
export class XpertProjectModule {}
