import { ConfigModule } from '@nestjs/config'
import { Module } from '@nestjs/common'
import { RouterModule } from '@nestjs/core'
import { DifyController } from './dify.controller'
import { DifyService } from './dify.service'
import { DifyKnowledgeStrategy } from './dify-knowledge.strategy'
import { DifyIntegrationStrategy } from './dify-integration.strategy'

@Module({
	imports: [
		RouterModule.register([{ path: '/dify', module: IntegrationDifyModule }]),
		ConfigModule,
	],
	controllers: [DifyController],
	providers: [DifyService, DifyIntegrationStrategy, DifyKnowledgeStrategy],
	exports: []
})
export class IntegrationDifyModule {}
