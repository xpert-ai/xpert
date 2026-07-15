import { TenantModule } from '@xpert-ai/server-core'
import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { DiscoveryModule, RouterModule } from '@nestjs/core'
import { SandboxProviderRegistry, SandboxRuntimeProviderRegistry } from '@xpert-ai/plugin-sdk'
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
import { SandboxFileMiddleware, SandboxServiceMiddleware, SandboxShellMiddleware } from './middlewares'
import { SuperAdminOrganizationScopeModule } from '../shared/super-admin-organization-scope.module'
import { LocalShellSandboxProvider } from './local-shell-sandbox.provider'
import {
    SandboxActionRegistry,
    SandboxJobEntity,
    SandboxJobRuntimeCapabilityService,
    SandboxRuntimeDefinitionRegistry
} from './sandbox-job'
import { SandboxRuntimeBindingSelector } from './sandbox-job/sandbox-runtime-binding-selector.service'
import { SandboxRuntimeHealthService } from './sandbox-job/sandbox-runtime-health.service'
import { SandboxJobCapacityService } from './sandbox-job/sandbox-job-capacity.service'
import { SandboxJobCapabilityRegistrationService } from './sandbox-job/sandbox-job-capability-registration.service'
import { AgentMiddlewareRuntimeModule } from '../shared/agent/middleware-runtime.module'
import { VolumeModule } from '../shared/volume'
import { NsjailSandboxProvider, NsjailWorkspacePathMapper } from './nsjail'

@Module({
    imports: [
        RouterModule.register([{ path: '/sandbox', module: SandboxModule }]),
        TenantModule,
        CqrsModule,
        DiscoveryModule,
        TypeOrmModule.forFeature([SandboxManagedServiceEntity, SandboxJobEntity]),
        AgentMiddlewareRuntimeModule,
        VolumeModule,

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
        SandboxRuntimeProviderRegistry,
        SandboxConversationContextService,
        SandboxTerminalGateway,
        LocalShellSandboxProvider,
        SandboxRuntimeDefinitionRegistry,
        SandboxRuntimeBindingSelector,
        SandboxRuntimeHealthService,
        SandboxActionRegistry,
        SandboxJobCapacityService,
        SandboxJobRuntimeCapabilityService,
        SandboxJobCapabilityRegistrationService,
        NsjailSandboxProvider,
        NsjailWorkspacePathMapper,
        SandboxFileMiddleware,
        SandboxServiceMiddleware,
        SandboxShellMiddleware,
        ...CommandHandlers
    ],
    exports: [
        SandboxService,
        SandboxManagedServiceService,
        SandboxProviderRegistry,
        SandboxRuntimeProviderRegistry,
        SandboxConversationContextService,
        LocalShellSandboxProvider,
        SandboxJobRuntimeCapabilityService,
        SandboxRuntimeDefinitionRegistry,
        SandboxRuntimeBindingSelector,
        SandboxRuntimeHealthService,
        SandboxActionRegistry,
        NsjailSandboxProvider,
        NsjailWorkspacePathMapper,
        SandboxFileMiddleware,
        SandboxServiceMiddleware,
        SandboxShellMiddleware
    ]
})
export class SandboxModule {}
