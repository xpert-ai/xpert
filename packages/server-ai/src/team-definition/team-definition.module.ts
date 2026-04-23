import { TenantModule } from '@xpert-ai/server-core'
import { Module } from '@nestjs/common'
import { RouterModule } from '@nestjs/core'
import { XpertModule } from '../xpert'
import { TeamDefinitionController } from './team-definition.controller'
import { TeamDefinitionService } from './team-definition.service'

@Module({
	imports: [
		RouterModule.register([{ path: '/team-definition', module: TeamDefinitionModule }]),
		TenantModule,
		XpertModule
	],
	controllers: [TeamDefinitionController],
	providers: [TeamDefinitionService],
	exports: [TeamDefinitionService]
})
export class TeamDefinitionModule {}
