import { TenantModule } from '@metad/server-core'
import { Module, forwardRef } from '@nestjs/common'
import { DiscoveryModule, RouterModule } from '@nestjs/core'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ToolsetRegistry } from '@xpert-ai/plugin-sdk'
import { CopilotModule } from '../copilot'
import { XpertWorkspaceModule } from '../xpert-workspace'
import { CommandHandlers } from './commands/handlers'
import { QueryHandlers } from './queries/handlers'
import { XpertToolsetController } from './xpert-toolset.controller'
import { XpertToolset } from './xpert-toolset.entity'
import { XpertToolsetService } from './xpert-toolset.service'

@Module({
	imports: [
		RouterModule.register([{ path: '/xpert-toolset', module: XpertToolsetModule }]),
		TypeOrmModule.forFeature([XpertToolset]),
		DiscoveryModule,
		TenantModule,
		CqrsModule,
		CopilotModule,
		forwardRef(() => XpertWorkspaceModule)
	],
	controllers: [XpertToolsetController],
	providers: [XpertToolsetService, ToolsetRegistry, ...QueryHandlers, ...CommandHandlers],
	exports: [XpertToolsetService]
})
export class XpertToolsetModule {}
