import { TenantModule } from '@xpert-ai/server-core'
import { forwardRef, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { SkillRepositoryIndexModule } from '../skill-repository/repository-index/skill-repository-index.module'
import { SkillRepositoryModule } from '../skill-repository/skill-repository.module'
import { SkillPackageController } from './skill-package.controller'
import { SkillPackage } from './skill-package.entity'
import { SkillPackageService } from './skill-package.service'
import { XpertWorkspaceModule } from '../xpert-workspace'
import { XpertWorkspace } from '../xpert-workspace/workspace.entity'
import { XpertTemplateModule } from '../xpert-template/xpert-template.module'
import { Strategies } from './plugins'
import { CommandHandlers } from './commands/handlers'
import { QueryHandlers } from './queries/handlers'

@Module({
    imports: [
        TypeOrmModule.forFeature([SkillPackage, XpertWorkspace]),
        TenantModule,
        CqrsModule,
        forwardRef(() => XpertWorkspaceModule),
        forwardRef(() => SkillRepositoryModule),
        SkillRepositoryIndexModule,
        forwardRef(() => XpertTemplateModule)
    ],
    controllers: [SkillPackageController],
    providers: [SkillPackageService, ...Strategies, ...CommandHandlers, ...QueryHandlers],
    exports: [SkillPackageService]
})
export class SkillPackageModule {}
