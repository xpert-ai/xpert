import { TenantModule } from '@metad/server-core'
import { forwardRef, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DiscoveryModule, RouterModule } from '@nestjs/core'
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
import { Validators } from './workflow'
import { WorkflowTriggerRegistry } from '@xpert-ai/plugin-sdk'

@Module({
	imports: [
		RouterModule.register([{ path: '/xpert-agent', module: XpertAgentModule }]),
		TypeOrmModule.forFeature([XpertAgent]),
		TenantModule,
		CqrsModule,
		DiscoveryModule,
		
		CopilotCheckpointModule,
		XpertAgentExecutionModule,
		forwardRef(() => XpertModule),
		forwardRef(() => EnvironmentModule),
		
	],
	controllers: [XpertAgentController],
	providers: [XpertAgentService, WorkflowTriggerRegistry, ...CommandHandlers, ...WorkflowCommandHandlers, ...QueryHandlers, ...Validators],
	exports: [XpertAgentService]
})
export class XpertAgentModule {}
