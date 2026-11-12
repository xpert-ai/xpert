import { PlatformUpdateService } from './app-platform/platform-update.service'
import { ApplicationUpdateService } from './application-update/application-update.service'
import { ApplicationInitializationLocks } from './application/application-initialization-locks'
import { BullModule } from '@nestjs/bull'
import { MembershipModule } from '../membership/membership.module'
import { AppPlatformDelivery } from './app-platform/app-platform-delivery.entity'
import { AppPlatformService, APP_PLATFORM_QUEUE } from './app-platform/app-platform.service'
import { AppPlatformController } from './app-platform/app-platform.controller'
import { AppPlatformWorker } from './app-platform/app-platform.worker'
import { PlatformMaintenanceActorService } from './app-platform/platform-maintenance-actor.service'
import { PlatformModelsService } from './app-platform/platform-models.service'
import { PlatformProvisionerService } from './app-platform/platform-provisioner.service'
import { ApplicationAccessService } from './application/application-access.service'
import { PrepareTemplateExecutionHandler } from './commands/handlers/prepare-template-execution.handler'
import { AssistantTemplateToolsetBinder } from './commands/assistant-template-toolset-binder.service'
import { ReconcileTemplateSkillReferencesHandler } from './template-installation/reconcile-template-skills.handler'
import { XpertAgentModule } from '../xpert-agent/xpert-agent.module'
import { SandboxModule } from '../sandbox/sandbox.module'
import {
    PrepareAssistantDefinitionHandler,
    InstallAssistantDefinitionDependenciesHandler
} from './template-installation/assistant-definition-import.handler'
import { TemplateDependencyInstaller } from './template-installation/template-dependency-installer.service'
import {
    TemplateReadinessService,
    InspectTemplateReadinessHandler,
    AssertAssistantTemplateDependenciesHandler
} from './template-installation/template-readiness.service'
import { TemplateInstallationController } from './template-installation/template-installation.controller'
import { TemplateInstallationService } from './template-installation/template-installation.service'
import { TemplateInstallationEntity } from './template-installation/template-installation.entity'
import { TemplateInstallationLocks } from './template-installation/template-installation-locks'
import { PluginApplicationSuiteService } from './application-suite/plugin-application-suite.service'
import { PluginApplicationToolsetsService } from './application-toolsets/plugin-application-toolsets.service'
import { PluginApplicationSetupService } from './application-setup/plugin-application-setup.service'
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
import { AssertAppPlatformUploadHandler } from './app-platform/app-platform-upload.handler'
import {
    CheckStorageQuotaHandler,
    RequestStorageUsageRefreshHandler,
    StorageQuotaAccountResolver
} from './app-platform/storage/platform-storage-budget.handler'
import { PlatformStorageUsageService } from './app-platform/storage/platform-storage-usage.service'
import { PlatformStorageDatabaseService } from './app-platform/storage/platform-storage-database.service'
import { AppPlatformStorageObject, AppPlatformStorageRoot } from './app-platform/storage/platform-storage-object.entity'
import { XpertWorkspaceModule } from '../xpert-workspace'
import { XpertWorkspace } from '../xpert-workspace/workspace.entity'
import { KnowledgebaseModule } from '../knowledgebase/management/knowledgebase.module'
import { Knowledgebase } from '../knowledgebase/persistence/knowledgebase.entity'
import { CopilotModule } from '../copilot/copilot.module'
import { Xpert } from '../xpert/xpert.entity'
import { PluginApplicationController } from './application/plugin-application.controller'
import { PluginApplicationInstallation } from './plugin-application-installation.entity'
import { PluginApplicationService } from './application/plugin-application.service'
import { PluginTemplateInstallHandler } from './commands/install-template.handler'
import { PluginTemplateSyncDependenciesHandler } from './commands/sync-template-dependencies.handler'
import { PluginHooksMiddleware } from './hooks/plugin-hooks.middleware'
import { PluginResourceController } from './plugin-resource.controller'
import { PluginResourceInstallation } from './plugin-resource-installation.entity'
import { PluginResourceInstallerService } from './installation/plugin-resource-installer.service'
import { QueryHandlers } from './queries/handlers'
import { McpPublicationModule } from '../mcp-publication'
import { McpPublication } from '../mcp-publication/entities/mcp-publication.entity'
import { McpPublicationAccess } from '../mcp-publication/entities/mcp-publication-access.entity'
import { PluginMcpServerService } from './mcp/plugin-mcp-server.service'
import { PreparePluginTestAccessHandler } from './commands/handlers/prepare-plugin-test-access.handler'

@Module({
    imports: [
        BullModule.registerQueue({ name: APP_PLATFORM_QUEUE }),
        MembershipModule,
        forwardRef(() => XpertAgentModule),
        forwardRef(() => SandboxModule),
        TypeOrmModule.forFeature([
            AppPlatformDelivery,
            AppPlatformStorageObject,
            AppPlatformStorageRoot,
            PluginResourceInstallation,
            TemplateInstallationEntity,
            PluginApplicationInstallation,
            SkillPackage,
            XpertToolset,
            XpertTool,
            XpertWorkspace,
            Knowledgebase,
            Xpert,
            McpPublication,
            McpPublicationAccess
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
    controllers: [
        PluginResourceController,
        PluginApplicationController,
        TemplateInstallationController,
        AppPlatformController
    ],
    providers: [
        AssertAppPlatformUploadHandler,
        CheckStorageQuotaHandler,
        RequestStorageUsageRefreshHandler,
        StorageQuotaAccountResolver,
        PlatformStorageDatabaseService,
        PlatformStorageUsageService,
        PlatformUpdateService,
        AppPlatformService,
        AppPlatformWorker,
        PlatformMaintenanceActorService,
        PlatformModelsService,
        PlatformProvisionerService,
        ApplicationInitializationLocks,
        ApplicationUpdateService,
        ApplicationAccessService,
        PrepareTemplateExecutionHandler,
        ReconcileTemplateSkillReferencesHandler,
        AssistantTemplateToolsetBinder,
        PrepareAssistantDefinitionHandler,
        InstallAssistantDefinitionDependenciesHandler,
        TemplateDependencyInstaller,
        TemplateReadinessService,
        InspectTemplateReadinessHandler,
        AssertAssistantTemplateDependenciesHandler,
        TemplateInstallationService,
        TemplateInstallationLocks,
        PluginApplicationSetupService,
        PluginApplicationToolsetsService,
        PluginApplicationSuiteService,
        PluginResourceInstallerService,
        PluginMcpServerService,
        PreparePluginTestAccessHandler,
        PluginApplicationService,
        PluginHooksMiddleware,
        PluginTemplateInstallHandler,
        PluginTemplateSyncDependenciesHandler,
        ...QueryHandlers
    ],
    exports: [PluginResourceInstallerService, PluginMcpServerService, PluginApplicationService]
})
export class PluginResourceModule {}
