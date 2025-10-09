import { TenantModule } from '@metad/server-core'
import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from '@nestjs/core'
import { XpertAgentExecutionController } from './agent-execution.controller'
import { XpertAgentExecution } from './agent-execution.entity'
import { XpertAgentExecutionService } from './agent-execution.service'
import { CommandHandlers } from './commands/handlers'
import { QueryHandlers } from './queries/handlers'

@Module({
	imports: [
		RouterModule.register([{ path: '/xpert-agent-execution', module: XpertAgentExecutionModule }]),
		TypeOrmModule.forFeature([XpertAgentExecution]),
		TenantModule,
		CqrsModule
	],
	controllers: [XpertAgentExecutionController],
	providers: [XpertAgentExecutionService, ...CommandHandlers, ...QueryHandlers],
	exports: [XpertAgentExecutionService]
})
export class XpertAgentExecutionModule {}
