import { RedisModule, TenantModule } from '@xpert-ai/server-core'
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
import { XpertAgentModule } from '../xpert-agent'
import { McpAppsController } from './mcp-apps.controller'
import { McpAppsService } from './mcp-apps.service'
import { McpRuntimeController } from './mcp-runtime.controller'
import { McpRuntimeAuditService } from './mcp-runtime-audit.service'
import { McpRuntimeInstanceEntity } from './mcp-runtime-instance.entity'
import { PluginResourceInstallation } from '../plugin-resource/plugin-resource-installation.entity'
import { ChatMessageModule } from '../chat-message'
import { ToolRuntimeService } from '../tool-runtime'
import { McpCapabilityCatalog } from '../mcp-publication/entities/mcp-capability-catalog.entity'
import { McpPublicationCapability } from '../mcp-publication/entities/mcp-publication-capability.entity'
import { McpSubscriptionService } from '../mcp-publication/mcp-subscription.service'
import {
    McpAppAudit,
    McpAppAuditService,
    McpAppInstanceStoreService,
    McpAppToolApprovalService
} from '../mcp-app-runtime'
import {
    McpConsumerOAuthController,
    McpConsumerOAuthCredential,
    McpConsumerOAuthService,
    McpConsumerOAuthSession
} from '../mcp-consumer/auth'
import { McpConsumerCapabilitiesController, McpConsumerCapabilitiesService } from '../mcp-consumer'

@Module({
    imports: [
        RouterModule.register([{ path: '/xpert-toolset', module: XpertToolsetModule }]),
        TypeOrmModule.forFeature([
            XpertToolset,
            McpRuntimeInstanceEntity,
            PluginResourceInstallation,
            McpCapabilityCatalog,
            McpPublicationCapability,
            McpAppAudit,
            McpConsumerOAuthCredential,
            McpConsumerOAuthSession
        ]),
        DiscoveryModule,
        RedisModule,
        TenantModule,
        CqrsModule,
        CopilotModule,
        ChatMessageModule,
        forwardRef(() => XpertWorkspaceModule),
        forwardRef(() => XpertAgentModule)
    ],
    controllers: [
        XpertToolsetController,
        McpAppsController,
        McpRuntimeController,
        McpConsumerOAuthController,
        McpConsumerCapabilitiesController
    ],
    providers: [
        XpertToolsetService,
        McpAppsService,
        McpRuntimeAuditService,
        McpAppAuditService,
        McpAppInstanceStoreService,
        McpAppToolApprovalService,
        McpConsumerOAuthService,
        McpConsumerCapabilitiesService,
        McpSubscriptionService,
        ToolRuntimeService,
        ToolsetRegistry,
        ...QueryHandlers,
        ...CommandHandlers
    ],
    exports: [
        XpertToolsetService,
        ToolRuntimeService,
        ToolsetRegistry,
        McpConsumerOAuthService,
        McpConsumerCapabilitiesService,
        McpSubscriptionService
    ]
})
export class XpertToolsetModule {}
