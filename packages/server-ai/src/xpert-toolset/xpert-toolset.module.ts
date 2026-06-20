import { TenantModule } from '@xpert-ai/server-core'
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

@Module({
    imports: [
        RouterModule.register([{ path: '/xpert-toolset', module: XpertToolsetModule }]),
        TypeOrmModule.forFeature([XpertToolset, McpRuntimeInstanceEntity, PluginResourceInstallation]),
        DiscoveryModule,
        TenantModule,
        CqrsModule,
        CopilotModule,
        forwardRef(() => XpertWorkspaceModule),
        forwardRef(() => XpertAgentModule)
    ],
    controllers: [XpertToolsetController, McpAppsController, McpRuntimeController],
    providers: [
        XpertToolsetService,
        McpAppsService,
        McpRuntimeAuditService,
        ToolsetRegistry,
        ...QueryHandlers,
        ...CommandHandlers
    ],
    exports: [XpertToolsetService]
})
export class XpertToolsetModule {}
