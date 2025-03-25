import { TenantModule } from '@metad/server-core'
import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { RouterModule } from 'nest-router'
import { CommandHandlers } from './commands/handlers'
import { SandboxService } from './sandbox.service'
import { SandboxController } from './sandbox.controller'
import { ChatConversationModule } from '../chat-conversation'

@Module({
	imports: [
		RouterModule.forRoutes([{ path: '/sandbox', module: SandboxModule }]),
		TenantModule,
		CqrsModule,

		ChatConversationModule
	],
	controllers: [SandboxController],
	providers: [SandboxService, ...CommandHandlers],
	exports: []
})
export class SandboxModule {}
