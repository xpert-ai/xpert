import { TenantModule } from '@metad/server-core'
import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from '@nestjs/core'
import { CopilotStore } from './copilot-store.entity'
import { CopilotStoreController } from './copilot-store.controller'
import { CopilotStoreService } from './copilot-store.service'
import { CommandHandlers } from './commands/handlers'


@Module({
	imports: [
		RouterModule.register([{ path: '/copilot-store', module: CopilotStoreModule }]),
		TypeOrmModule.forFeature([CopilotStore,]),
		TenantModule,
		CqrsModule,
	],
	controllers: [CopilotStoreController],
	providers: [CopilotStoreService, ...CommandHandlers],
	exports: [CopilotStoreService]
})
export class CopilotStoreModule {}
