import { IntegrationModule } from '@metad/server-core'
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { RouterModule } from 'nest-router'
import { GithubController } from './github.controller'
import { GithubService } from './github.service'

@Module({
	imports: [
		RouterModule.forRoutes([{ path: '/github', module: IntegrationGithubModule }]),
		ConfigModule,
		IntegrationModule
	],
	providers: [GithubService],
	controllers: [GithubController],
	exports: [GithubService]
})
export class IntegrationGithubModule {}
