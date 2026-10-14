import { CqrsModule } from '@nestjs/cqrs'
import { ImportDefaultAgentPluginsHandler } from './defaults/import-default-agent-plugins.handler'
import { Global, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AgentPluginPackage, AgentResourceBinding } from './agent-plugin.entity'
import { AgentPluginService } from './agent-plugin.service'
import { RuntimeResourceService } from './runtime-resource.service'
import { AgentPluginController } from './agent-plugin.controller'
import { ConnectorModule } from '../connector/connector.module'
import { AgentPluginConnectorService } from './agent-plugin-connector.service'
import { AgentPluginInstallationsService } from './agent-plugin-installations.service'
import { PluginResourceModule } from '../plugin-resource/plugin-resource.module'
import { ResolvePluginConnectorsHandler } from './queries/resolve-plugin-connectors.handler'

@Global()
@Module({
    imports: [
        CqrsModule,
        TypeOrmModule.forFeature([AgentPluginPackage, AgentResourceBinding]),
        ConnectorModule,
        PluginResourceModule
    ],
    controllers: [AgentPluginController],
    providers: [
        AgentPluginService,
        ImportDefaultAgentPluginsHandler,
        RuntimeResourceService,
        AgentPluginConnectorService,
        ResolvePluginConnectorsHandler,
        AgentPluginInstallationsService,
        { provide: 'XpertAgentPluginService', useExisting: AgentPluginService },
        { provide: 'XpertRuntimeResourceService', useExisting: RuntimeResourceService }
    ],
    exports: [AgentPluginService, RuntimeResourceService, 'XpertAgentPluginService', 'XpertRuntimeResourceService']
})
export class AgentPluginModule {}
