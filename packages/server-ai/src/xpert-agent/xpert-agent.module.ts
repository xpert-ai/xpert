import { RedisModule, TenantModule } from '@metad/server-core'
import { forwardRef, Module } from '@nestjs/common'
import { DiscoveryModule, RouterModule } from '@nestjs/core'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AgentMiddlewareRegistry, WorkflowNodeRegistry, WorkflowTriggerRegistry } from '@xpert-ai/plugin-sdk'
import { CopilotCheckpointModule } from '../copilot-checkpoint'
import { EnvironmentModule } from '../environment'
import { XpertAgentExecutionModule } from '../xpert-agent-execution'
import { XpertModule } from '../xpert/xpert.module'
import { CommandHandlers } from './commands/handlers'
import { QueryHandlers } from './queries/handlers'
import { Validators } from './workflow'
import { WorkflowCommandHandlers } from './workflow/handlers'
import { XpertAgentController } from './xpert-agent.controller'
import { XpertAgent } from './xpert-agent.entity'
import { XpertAgentService } from './xpert-agent.service'
import { Strategies, Validators as PluginValidators } from './plugins'
import { ExecutionCancelModule } from '../shared'

@Module({
	imports: [
		RouterModule.register([{ path: '/xpert-agent', module: XpertAgentModule }]),
		TypeOrmModule.forFeature([XpertAgent]),
		TenantModule,
		RedisModule,
		CqrsModule,
		DiscoveryModule,

		CopilotCheckpointModule,
		XpertAgentExecutionModule,
		forwardRef(() => XpertModule),
		forwardRef(() => EnvironmentModule),
		ExecutionCancelModule
	],
	controllers: [XpertAgentController],
	providers: [
		XpertAgentService,
		WorkflowTriggerRegistry,
		WorkflowNodeRegistry,
		AgentMiddlewareRegistry,
		...CommandHandlers,
		...WorkflowCommandHandlers,
		...QueryHandlers,
		...Validators,
		...PluginValidators,
		...Strategies
	],
	exports: [XpertAgentService, AgentMiddlewareRegistry]
})
export class XpertAgentModule {}
