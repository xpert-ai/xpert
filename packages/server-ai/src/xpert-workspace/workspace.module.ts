import { TenantModule } from '@metad/server-core'
import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from '@nestjs/core'
import { XpertWorkspaceController } from './workspace.controller'
import { XpertWorkspace } from './workspace.entity'
import { XpertWorkspaceService } from './workspace.service'
import { QueryHandlers } from './queries/handlers'

@Module({
	imports: [
		RouterModule.register([{ path: '/xpert-workspace', module: XpertWorkspaceModule }]),
		TypeOrmModule.forFeature([XpertWorkspace]),
		TenantModule,
		CqrsModule,
	],
	controllers: [XpertWorkspaceController],
	providers: [XpertWorkspaceService, ...QueryHandlers],
	exports: [XpertWorkspaceService]
})
export class XpertWorkspaceModule {}
