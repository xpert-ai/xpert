import { TenantModule } from '@xpert-ai/server-core'
import { Module } from '@nestjs/common'
import { RouterModule } from '@nestjs/core'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ProjectCoreModule } from '../project-core/project-core.module'
import { ProjectTask } from '../project-task/project-task.entity'
import { TeamDefinitionModule } from '../team-definition/team-definition.module'
import { ProjectTeamBinding } from './project-team-binding.entity'
import { TeamBindingController } from './team-binding.controller'
import { TeamBindingService } from './team-binding.service'

@Module({
	imports: [
		RouterModule.register([{ path: '/team-binding', module: TeamBindingModule }]),
		TypeOrmModule.forFeature([ProjectTeamBinding, ProjectTask]),
		TenantModule,
		ProjectCoreModule,
		TeamDefinitionModule
	],
	controllers: [TeamBindingController],
	providers: [TeamBindingService],
	exports: [TeamBindingService]
})
export class TeamBindingModule {}
