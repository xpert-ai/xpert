import { TenantModule, UserModule } from '@xpert-ai/server-core'
import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from '@nestjs/core'
import { CopilotModelController } from './copilot-model.controller'
import { CopilotModel } from './copilot-model.entity'
import { CopilotModelService } from './copilot-model.service'
import { QueryHandlers } from './queries/handlers'
import { CommandHandlers } from './commands'
import { AgentMiddlewareRuntimeModule } from '../shared/agent/middleware-runtime.module'

@Module({
	imports: [
		RouterModule.register([{ path: '/copilot-model', module: CopilotModelModule }]),
		TypeOrmModule.forFeature([CopilotModel]),
		TenantModule,
		CqrsModule,
		UserModule,
		AgentMiddlewareRuntimeModule
	],
	controllers: [CopilotModelController,],
	providers: [CopilotModelService, ...QueryHandlers, ...CommandHandlers],
	exports: [CopilotModelService]
})
export class CopilotModelModule {}
