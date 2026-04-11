import { TenantModule } from '@xpert-ai/server-core'
import { forwardRef, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { SkillRepositoryIndexModule, SkillRepositoryModule } from '../skill-repository'
import { SkillPackageController } from './skill-package.controller'
import { SkillPackage } from './skill-package.entity'
import { SkillPackageService } from './skill-package.service'
import { XpertWorkspaceModule } from '../xpert-workspace'
import { XpertWorkspace } from '../xpert-workspace/workspace.entity'
import { Strategies } from './plugins'

@Module({
	imports: [
		TypeOrmModule.forFeature([SkillPackage, XpertWorkspace]),
		TenantModule,
		CqrsModule,
		forwardRef(() => XpertWorkspaceModule),
		SkillRepositoryModule,
		SkillRepositoryIndexModule
	],
	controllers: [SkillPackageController],
	providers: [SkillPackageService, ...Strategies],
	exports: [SkillPackageService]
})
export class SkillPackageModule {}
