import { TenantModule } from '@metad/server-core'
import { Module, forwardRef } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from 'nest-router'
import { XpertToolsetController } from './xpert-toolset.controller'
import { XpertToolset } from './xpert-toolset.entity'
import { XpertToolsetService } from './xpert-toolset.service'
import { QueryHandlers } from './queries/handlers'
import { CopilotModule } from '../copilot'
import { CommandHandlers } from './commands/handlers'
import { XpertWorkspaceModule } from '../xpert-workspace'


@Module({
	imports: [
		RouterModule.forRoutes([{ path: '/xpert-toolset', module: XpertToolsetModule }]),
		TypeOrmModule.forFeature([XpertToolset]),
		TenantModule,
		CqrsModule,
		CopilotModule,
		forwardRef(() => XpertWorkspaceModule),
	],
	controllers: [XpertToolsetController],
	providers: [XpertToolsetService, ...QueryHandlers, ...CommandHandlers],
	exports: [XpertToolsetService]
})
export class XpertToolsetModule {}
