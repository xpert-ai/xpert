import { TenantModule } from '@xpert-ai/server-core'
import { forwardRef, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { SkillPackageModule } from '../skill-package'
import { SkillPackage } from '../skill-package/skill-package.entity'
import { XpertModule } from '../xpert'
import { XpertTemplateModule } from '../xpert-template/xpert-template.module'
import { XpertTool } from '../xpert-tool/xpert-tool.entity'
import { XpertToolset } from '../xpert-toolset/xpert-toolset.entity'
import { XpertToolsetModule } from '../xpert-toolset'
import { XpertWorkspaceModule } from '../xpert-workspace'
import { PluginTemplateInstallHandler } from './commands/install-template.handler'
import { PluginHooksMiddleware } from './plugin-hooks.middleware'
import { PluginResourceController } from './plugin-resource.controller'
import { PluginResourceInstallation } from './plugin-resource-installation.entity'
import { PluginResourceInstallerService } from './plugin-resource-installer.service'

@Module({
    imports: [
        TypeOrmModule.forFeature([PluginResourceInstallation, SkillPackage, XpertToolset, XpertTool]),
        TenantModule,
        CqrsModule,
        forwardRef(() => XpertModule),
        XpertTemplateModule,
        forwardRef(() => SkillPackageModule),
        forwardRef(() => XpertToolsetModule),
        forwardRef(() => XpertWorkspaceModule)
    ],
    controllers: [PluginResourceController],
    providers: [PluginResourceInstallerService, PluginHooksMiddleware, PluginTemplateInstallHandler],
    exports: [PluginResourceInstallerService]
})
export class PluginResourceModule {}
