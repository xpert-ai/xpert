import { TenantModule } from '@metad/server-core'
import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { DiscoveryModule, RouterModule } from '@nestjs/core'
import { SandboxProviderRegistry } from '@xpert-ai/plugin-sdk'
import { CommandHandlers } from './commands/handlers'
import { SandboxService } from './sandbox.service'
import { SandboxController } from './sandbox.controller'
import { ChatConversationModule } from '../chat-conversation'

@Module({
	imports: [
		RouterModule.register([{ path: '/sandbox', module: SandboxModule }]),
		TenantModule,
		CqrsModule,
		DiscoveryModule,

		ChatConversationModule
	],
	controllers: [SandboxController],
	providers: [SandboxService, SandboxProviderRegistry, ...CommandHandlers],
	exports: [SandboxService, SandboxProviderRegistry]
})
export class SandboxModule {}
