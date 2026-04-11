import { TenantModule } from '@xpert-ai/server-core'
import { BullModule } from '@nestjs/bull'
import { DiscoveryModule } from '@nestjs/core'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { SkillSourceProviderRegistry } from '@xpert-ai/plugin-sdk'
import { GITHUB_REQUEST_QUEUE } from './plugins/github/github.constants'
import { GithubRequestProcessor } from './plugins/github/github-request.job'
import { SkillRepositoryController } from './skill-repository.controller'
import { SkillRepository } from './skill-repository.entity'
import { SkillRepositoryService } from './skill-repository.service'
import { SkillRepositoryIndexModule } from './repository-index/skill-repository-index.module'
import { SkillSourceProviders } from './plugins'
import { SkillPackage } from '../skill-package/skill-package.entity'

@Module({
	imports: [
		TypeOrmModule.forFeature([SkillRepository, SkillPackage]),
		TenantModule,
		DiscoveryModule,
		SkillRepositoryIndexModule,
		BullModule.registerQueue({
			name: GITHUB_REQUEST_QUEUE,
			limiter: {
				max: 1,
				duration: 200
			}
		})
	],
	controllers: [SkillRepositoryController],
	providers: [
		SkillRepositoryService,
		SkillSourceProviderRegistry,
		GithubRequestProcessor,
		...SkillSourceProviders
	],
	exports: [SkillRepositoryService, SkillSourceProviderRegistry]
})
export class SkillRepositoryModule {}
