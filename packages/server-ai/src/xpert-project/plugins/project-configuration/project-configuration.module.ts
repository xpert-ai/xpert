import { Module } from '@nestjs/common'
import { ProjectConfigurationViewProvider } from './project-configuration.provider'
import { ConfigurationEditorsService } from './services/configuration-editors.service'
import { ConfigurationAutomationService } from './services/configuration-automation.service'
import { ConfigurationConnectorsService } from './services/configuration-connectors.service'

/** Built-in plugin: all host operations go through the SDK capability supplied by the platform. */
@Module({
    providers: [
        ProjectConfigurationViewProvider,
        ConfigurationEditorsService,
        ConfigurationAutomationService,
        ConfigurationConnectorsService
    ]
})
export class ProjectConfigurationPluginModule {}
