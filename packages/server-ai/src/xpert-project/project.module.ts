import { IntegrationModule, TenantModule } from '@metad/server-core'
import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from '@nestjs/core'
import { XpertProject } from './entities/project.entity'
import { XpertProjectController } from './project.controller'
import { XpertProjectService } from './project.service'
import { XpertProjectTask } from './entities/project-task.entity'
import { XpertProjectTaskStep } from './entities/project-task-step.entity'
import { XpertProjectTaskLog } from './entities/project-task-log.entity'
import { CommandHandlers } from './commands/handlers'
import { XpertProjectTaskService } from './services'
import { VcsService } from './services/vcs-service'
import { IntegrationGithubModule } from '../integration-github'

@Module({
	imports: [
		RouterModule.register([{ path: '/xpert-project', module: XpertProjectModule }]),
		TypeOrmModule.forFeature([
			XpertProject,
			XpertProjectTask,
			XpertProjectTaskStep,
			XpertProjectTaskLog,
		]),
		TenantModule,
		CqrsModule,
		IntegrationModule,
		IntegrationGithubModule
	],
	controllers: [XpertProjectController],
	providers: [XpertProjectService, XpertProjectTaskService, VcsService, ...CommandHandlers],
	exports: [XpertProjectService]
})
export class XpertProjectModule {}
