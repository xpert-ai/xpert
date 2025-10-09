import { TenantModule } from '@metad/server-core'
import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from '@nestjs/core'
import { XpertToolController } from './xpert-tool.controller'
import { XpertTool } from './xpert-tool.entity'
import { XpertToolService } from './xpert-tool.service'
import { CommandHandlers } from './commands/handlers'
import { XpertToolsetModule } from '../xpert-toolset'

@Module({
	imports: [
		RouterModule.register([{ path: '/xpert-tool', module: XpertToolModule }]),
		TypeOrmModule.forFeature([XpertTool]),
		TenantModule,
		CqrsModule,
		XpertToolsetModule
	],
	controllers: [XpertToolController],
	providers: [XpertToolService, ...CommandHandlers],
	exports: [XpertToolService]
})
export class XpertToolModule {}
