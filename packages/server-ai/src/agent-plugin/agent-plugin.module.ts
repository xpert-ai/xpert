import { Global, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AgentPluginPackage, AgentResourceBinding } from './agent-plugin.entity'
import { AgentPluginService } from './agent-plugin.service'
import { RuntimeResourceService } from './runtime-resource.service'
import { AgentPluginController } from './agent-plugin.controller'
import { ConnectorModule } from '../connector/connector.module'
import { AgentPluginConnectorService } from './agent-plugin-connector.service'

@Global()
@Module({
    imports: [TypeOrmModule.forFeature([AgentPluginPackage, AgentResourceBinding]), ConnectorModule],
    controllers: [AgentPluginController],
    providers: [
        AgentPluginService,
        RuntimeResourceService,
        AgentPluginConnectorService,
        { provide: 'XpertAgentPluginService', useExisting: AgentPluginService },
        { provide: 'XpertRuntimeResourceService', useExisting: RuntimeResourceService }
    ],
    exports: [AgentPluginService, RuntimeResourceService, 'XpertAgentPluginService', 'XpertRuntimeResourceService']
})
export class AgentPluginModule {}
