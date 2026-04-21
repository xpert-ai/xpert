import { OrganizationModule, UserModule, UserOrganizationModule } from '@xpert-ai/server-core'
import { BullModule } from '@nestjs/bull'
import { Module } from '@nestjs/common'
import { XpertModule } from '../xpert'
import { EnvironmentModule } from '../environment'
import { SkillPackageModule } from '../skill-package'
import { SkillRepositoryIndexModule, SkillRepositoryModule } from '../skill-repository'
import { XpertTemplateModule } from '../xpert-template/xpert-template.module'
import { XpertWorkspaceModule } from '../xpert-workspace/workspace.module'
import { AI_BOOTSTRAP_QUEUE } from './constants'
import { ServerAIBootstrapProcessor } from './bootstrap.processor'
import { ServerAIBootstrapService } from './bootstrap.service'

@Module({
	imports: [
		BullModule.registerQueue({
			name: AI_BOOTSTRAP_QUEUE
		}),
		OrganizationModule,
		UserModule,
		UserOrganizationModule,
		XpertWorkspaceModule,
		EnvironmentModule,
		SkillPackageModule,
		SkillRepositoryModule,
		SkillRepositoryIndexModule,
		XpertModule,
		XpertTemplateModule
	],
	providers: [ServerAIBootstrapProcessor, ServerAIBootstrapService]
})
export class InitializationModule {}
