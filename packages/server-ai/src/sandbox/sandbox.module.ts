import { TenantModule } from '@xpert-ai/server-core'
import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { DiscoveryModule, RouterModule } from '@nestjs/core'
import {
    isDevelopmentSandboxRuntimeEnvironment,
    SandboxProviderRegistry,
    SandboxRuntimeProviderRegistry
} from '@xpert-ai/plugin-sdk'
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
import { LocalBrowserRuntimeProvider } from './sandbox-job/local-browser-runtime.provider'
import { AgentMiddlewareRuntimeModule } from '../shared/agent/middleware-runtime.module'
import { VolumeModule } from '../shared/volume'

// Local Browser Runtime is source-checkout tooling, never a production fallback.
const LOCAL_BROWSER_RUNTIME_PROVIDERS = isDevelopmentSandboxRuntimeEnvironment() ? [LocalBrowserRuntimeProvider] : []

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
        ...LOCAL_BROWSER_RUNTIME_PROVIDERS,
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
        ...LOCAL_BROWSER_RUNTIME_PROVIDERS,
        SandboxConversationContextService,
        LocalShellSandboxProvider,
        SandboxJobRuntimeCapabilityService,
        SandboxRuntimeDefinitionRegistry,
        SandboxRuntimeBindingSelector,
        SandboxRuntimeHealthService,
        SandboxActionRegistry,
        SandboxFileMiddleware,
        SandboxServiceMiddleware,
        SandboxShellMiddleware
    ]
})
export class SandboxModule {}
