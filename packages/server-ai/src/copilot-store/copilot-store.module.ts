import { TenantModule } from '@metad/server-core'
import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from 'nest-router'
import { CopilotStore } from './copilot-store.entity'
import { CopilotStoreController } from './copilot-store.controller'
import { CopilotStoreService } from './copilot-store.service'
import { CommandHandlers } from './commands/handlers'


@Module({
	imports: [
		RouterModule.forRoutes([{ path: '/copilot-store', module: CopilotStoreModule }]),
		TypeOrmModule.forFeature([CopilotStore]),
		TenantModule,
		CqrsModule,
	],
	controllers: [CopilotStoreController],
	providers: [CopilotStoreService, ...CommandHandlers],
	exports: [CopilotStoreService]
})
export class CopilotStoreModule {}
