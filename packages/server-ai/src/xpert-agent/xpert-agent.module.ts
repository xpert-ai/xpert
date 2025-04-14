import { TenantModule } from '@metad/server-core'
import { forwardRef, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from 'nest-router'
import { XpertAgentController } from './xpert-agent.controller'
import { XpertAgent } from './xpert-agent.entity'
import { XpertAgentService } from './xpert-agent.service'
import { CommandHandlers } from './commands/handlers'
import { CopilotCheckpointModule } from '../copilot-checkpoint'
import { XpertAgentExecutionModule } from '../xpert-agent-execution'
import { QueryHandlers } from './queries/handlers'
import { XpertModule } from '../xpert/xpert.module'
import { WorkflowCommandHandlers } from './workflow/handlers'
import { EnvironmentModule } from '../environment'

@Module({
	imports: [
		RouterModule.forRoutes([{ path: '/xpert-agent', module: XpertAgentModule }]),
		TypeOrmModule.forFeature([XpertAgent]),
		TenantModule,
		CqrsModule,
		
		CopilotCheckpointModule,
		XpertAgentExecutionModule,
		forwardRef(() => XpertModule),
		forwardRef(() => EnvironmentModule),
	],
	controllers: [XpertAgentController],
	providers: [XpertAgentService, ...CommandHandlers, ...WorkflowCommandHandlers, ...QueryHandlers],
	exports: [XpertAgentService]
})
export class XpertAgentModule {}
