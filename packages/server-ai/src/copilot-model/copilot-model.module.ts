import { TenantModule, UserModule } from '@metad/server-core'
import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from '@nestjs/core'
import { CopilotModelController } from './copilot-model.controller'
import { CopilotModel } from './copilot-model.entity'
import { CopilotModelService } from './copilot-model.service'
import { QueryHandlers } from './queries/handlers'

@Module({
	imports: [
		RouterModule.register([{ path: '/copilot-model', module: CopilotModelModule }]),
		TypeOrmModule.forFeature([CopilotModel]),
		TenantModule,
		CqrsModule,
		UserModule
	],
	controllers: [CopilotModelController,],
	providers: [CopilotModelService, ...QueryHandlers],
	exports: [CopilotModelService]
})
export class CopilotModelModule {}
