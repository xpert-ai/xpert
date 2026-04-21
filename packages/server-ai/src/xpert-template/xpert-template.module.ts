import { TenantModule, UserModule } from '@xpert-ai/server-core'
import { forwardRef, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CqrsModule } from '@nestjs/cqrs'
import { RouterModule } from '@nestjs/core'
import { SkillPackageModule } from '../skill-package'
import { SkillRepository } from '../skill-repository'
import { SkillRepositoryModule } from '../skill-repository/skill-repository.module'
import { SkillRepositoryIndexModule } from '../skill-repository/repository-index/skill-repository-index.module'
import { XpertWorkspace } from '../xpert-workspace/workspace.entity'
import { TemplateSkillSyncScheduler } from './template-skill-sync.scheduler'
import { TemplateSkillSyncService } from './template-skill-sync.service'
import { XpertTemplateService } from './xpert-template.service'
import { XpertTemplateController } from './xpert-template.controller'
import { XpertTemplate } from './xpert-template.entity'


@Module({
	imports: [
		RouterModule.register([{ path: '/xpert-template', module: XpertTemplateModule }]),
		TypeOrmModule.forFeature([XpertTemplate, SkillRepository, XpertWorkspace]),
		TenantModule,
		UserModule,
		CqrsModule,
		SkillRepositoryModule,
		SkillRepositoryIndexModule,
		forwardRef(() => SkillPackageModule),
	],
	controllers: [XpertTemplateController],
	providers: [XpertTemplateService, TemplateSkillSyncService, TemplateSkillSyncScheduler],
	exports: [XpertTemplateService, TemplateSkillSyncService]
})
export class XpertTemplateModule {}
