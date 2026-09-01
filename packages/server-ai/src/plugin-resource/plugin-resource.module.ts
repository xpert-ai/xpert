import { TenantModule } from '@xpert-ai/server-core'
import { forwardRef, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { EnvironmentModule } from '../environment'
import { SkillPackageModule } from '../skill-package'
import { SkillPackage } from '../skill-package/skill-package.entity'
import { XpertModule } from '../xpert'
import { XpertTemplateModule } from '../xpert-template/xpert-template.module'
import { XpertTool } from '../xpert-tool/xpert-tool.entity'
import { XpertToolset } from '../xpert-toolset/xpert-toolset.entity'
import { XpertToolsetModule } from '../xpert-toolset'
import { XpertWorkspaceModule } from '../xpert-workspace'
import { XpertWorkspace } from '../xpert-workspace/workspace.entity'
import { KnowledgebaseModule } from '../knowledgebase/knowledgebase.module'
import { Knowledgebase } from '../knowledgebase/knowledgebase.entity'
import { CopilotModule } from '../copilot/copilot.module'
import { Xpert } from '../xpert/xpert.entity'
import { PluginApplicationController } from './plugin-application.controller'
import { PluginApplicationInstallation } from './plugin-application-installation.entity'
import { PluginApplicationService } from './plugin-application.service'
import { PluginTemplateInstallHandler } from './commands/install-template.handler'
import { PluginTemplateSyncDependenciesHandler } from './commands/sync-template-dependencies.handler'
import { PluginHooksMiddleware } from './plugin-hooks.middleware'
import { PluginResourceController } from './plugin-resource.controller'
import { PluginResourceInstallation } from './plugin-resource-installation.entity'
import { PluginResourceInstallerService } from './plugin-resource-installer.service'
import { QueryHandlers } from './queries/handlers'
import { McpPublicationModule } from '../mcp-publication'

@Module({
    imports: [
        TypeOrmModule.forFeature([
            PluginResourceInstallation,
            PluginApplicationInstallation,
            SkillPackage,
            XpertToolset,
            XpertTool,
            XpertWorkspace,
            Knowledgebase,
            Xpert
        ]),
        TenantModule,
        CqrsModule,
        EnvironmentModule,
        forwardRef(() => XpertModule),
        XpertTemplateModule,
        forwardRef(() => SkillPackageModule),
        forwardRef(() => XpertToolsetModule),
        forwardRef(() => XpertWorkspaceModule),
        forwardRef(() => KnowledgebaseModule),
        CopilotModule,
        McpPublicationModule
    ],
    controllers: [PluginResourceController, PluginApplicationController],
    providers: [
        PluginResourceInstallerService,
        PluginApplicationService,
        PluginHooksMiddleware,
        PluginTemplateInstallHandler,
        PluginTemplateSyncDependenciesHandler,
        ...QueryHandlers
    ],
    exports: [PluginResourceInstallerService, PluginApplicationService]
})
export class PluginResourceModule {}
