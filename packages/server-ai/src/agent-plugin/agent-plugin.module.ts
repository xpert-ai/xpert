import { RuntimeResourceCommandsService } from './commands/runtime-resource-commands.service'
import { ResourceSkillInstructionsHandler } from './commands/resource-skill-instructions.handler'
import {
    AuthorizeTemplateExecutionHandler,
    ResolveTemplateExecutionHandler
} from './templates/resolve-template-execution.command'
import { AgentPluginMaintenanceController } from './maintenance/agent-plugin-maintenance.controller'
import { AgentPluginCleanupService } from './maintenance/agent-plugin-cleanup.service'
import { AgentPluginUpdateService } from './maintenance/agent-plugin-update.service'
import { AgentPluginUpdateStore } from './maintenance/agent-plugin-update.store'
import { CqrsModule } from '@nestjs/cqrs'
import { InstallAgentPluginTemplateResourcesHandler } from './templates/install-template-resources.handler'
import { ImportDefaultAgentPluginsHandler } from './defaults/import-default-agent-plugins.handler'
import { DefaultAgentPluginsService } from './defaults/default-agent-plugins.service'
import { DefaultAgentPluginsStore } from './defaults/default-agent-plugins.store'
import { DefaultAgentPluginsImporter } from './defaults/default-agent-plugins.importer'
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
import {
    AgentPluginTemplateService,
    AgentPluginTemplatesHandler,
    ResolveAgentPluginTemplateDependencyHandler,
    AssertAgentPluginTemplateDependencyHandler
} from './templates/agent-plugin-template.handler'
import { ResolvePluginConnectorsHandler } from './queries/resolve-plugin-connectors.handler'

@Global()
@Module({
    imports: [
        CqrsModule,
        TypeOrmModule.forFeature([AgentPluginPackage, AgentResourceBinding]),
        ConnectorModule,
        PluginResourceModule
    ],
    controllers: [AgentPluginController, AgentPluginMaintenanceController],
    providers: [
        RuntimeResourceCommandsService,
        ResourceSkillInstructionsHandler,
        ResolveTemplateExecutionHandler,
        AuthorizeTemplateExecutionHandler,
        AgentPluginCleanupService,
        AgentPluginUpdateService,
        AgentPluginUpdateStore,
        InstallAgentPluginTemplateResourcesHandler,
        AgentPluginTemplateService,
        AgentPluginTemplatesHandler,
        ResolveAgentPluginTemplateDependencyHandler,
        AssertAgentPluginTemplateDependencyHandler,
        AgentPluginService,
        ImportDefaultAgentPluginsHandler,
        DefaultAgentPluginsService,
        DefaultAgentPluginsStore,
        DefaultAgentPluginsImporter,
        RuntimeResourceService,
        AgentPluginConnectorService,
        ResolvePluginConnectorsHandler,
        AgentPluginInstallationsService,
        { provide: 'XpertAgentPluginService', useExisting: AgentPluginService },
        { provide: 'XpertRuntimeResourceService', useExisting: RuntimeResourceService }
    ],
    exports: [
        RuntimeResourceCommandsService,
        AgentPluginService,
        RuntimeResourceService,
        'XpertAgentPluginService',
        'XpertRuntimeResourceService'
    ]
})
export class AgentPluginModule {}
