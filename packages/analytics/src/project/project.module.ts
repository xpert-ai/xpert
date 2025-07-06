import { TenantModule } from '@metad/server-core'
import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from 'nest-router'
import { SemanticModelModule } from '../model'
import { CommandHandlers } from './commands/handlers'
import { ProjectController } from './project.controller'
import { Project } from './project.entity'
import { ProjectService } from './project.service'
import { QueryHandlers } from './queries/handlers'

@Module({
	imports: [
		RouterModule.forRoutes([{ path: '/project', module: ProjectModule }]),
		TypeOrmModule.forFeature([Project]),
		TenantModule,
		CqrsModule,
		SemanticModelModule
	],
	controllers: [ProjectController],
	providers: [ProjectService, ...QueryHandlers, ...CommandHandlers],
	exports: [TypeOrmModule, ProjectService]
})
export class ProjectModule {}
