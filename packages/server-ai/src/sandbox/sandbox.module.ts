import { TenantModule } from '@xpert-ai/server-core'
import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { DiscoveryModule, RouterModule } from '@nestjs/core'
import { SandboxProviderRegistry } from '@xpert-ai/plugin-sdk'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CommandHandlers } from './commands/handlers'
import { SandboxConversationContextService } from './sandbox-conversation-context.service'
import { SandboxPreviewAuthGuard } from './sandbox-preview-auth.guard'
import { SandboxPreviewSessionService } from './sandbox-preview-session.service'
import { SandboxManagedServiceEntity } from './sandbox-managed-service.entity'
import { SandboxManagedServiceService } from './sandbox-managed-service.service'
import { SandboxService } from './sandbox.service'
import { SandboxController } from './sandbox.controller'
import { SandboxTerminalGateway } from './sandbox-terminal.gateway'
import { ChatConversationModule } from '../chat-conversation'
import { SandboxServiceMiddleware, SandboxShellMiddleware } from './middlewares'
import { SuperAdminOrganizationScopeModule } from '../shared/super-admin-organization-scope.module'

@Module({
	imports: [
		RouterModule.register([{ path: '/sandbox', module: SandboxModule }]),
		TenantModule,
		CqrsModule,
		DiscoveryModule,
        TypeOrmModule.forFeature([SandboxManagedServiceEntity]),

		ChatConversationModule,
		SuperAdminOrganizationScopeModule
	],
	controllers: [SandboxController],
	providers: [
		SandboxService,
		SandboxManagedServiceService,
		SandboxPreviewSessionService,
		SandboxPreviewAuthGuard,
		SandboxProviderRegistry,
		SandboxConversationContextService,
		SandboxTerminalGateway,
		SandboxServiceMiddleware,
		SandboxShellMiddleware,
		...CommandHandlers
	],
	exports: [
		SandboxService,
		SandboxManagedServiceService,
		SandboxProviderRegistry,
		SandboxConversationContextService,
		SandboxServiceMiddleware,
		SandboxShellMiddleware
	]
})
export class SandboxModule {}
