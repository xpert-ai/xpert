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
import { ChatConversation } from '../chat-conversation/conversation.entity'
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
import { LocalBrowserRuntimeProvider } from './sandbox-job/local-browser-runtime.provider'
import { AgentMiddlewareRuntimeModule } from '../shared/agent/middleware-runtime/index'
import { VolumeModule } from '../shared/volume'
import { NsjailSandboxProvider, NsjailWorkspacePathMapper } from './nsjail'
import { XpertProjectAccessModule } from '../xpert-project/project-access.module'

// Local Browser Runtime is source-checkout tooling, never a production fallback.
const LOCAL_BROWSER_RUNTIME_PROVIDERS = isDevelopmentSandboxRuntimeEnvironment() ? [LocalBrowserRuntimeProvider] : []

@Module({
    imports: [
        RouterModule.register([{ path: '/sandbox', module: SandboxModule }]),
        TenantModule,
        CqrsModule,
        DiscoveryModule,
        TypeOrmModule.forFeature([SandboxManagedServiceEntity, SandboxJobEntity, ChatConversation]),
        AgentMiddlewareRuntimeModule,
        VolumeModule,

        XpertProjectAccessModule,
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
        ...LOCAL_BROWSER_RUNTIME_PROVIDERS,
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
