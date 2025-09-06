import { ConfigModule } from '@nestjs/config'
import { IntegrationModule } from '@metad/server-core'
import { Module } from '@nestjs/common'
import { RouterModule } from '@nestjs/core'
import { DifyController } from './dify.controller'
import { DifyService } from './dify.service'
import { DifyKnowledgeStrategy } from './dify-knowledge.strategy'

@Module({
	imports: [
		RouterModule.register([{ path: '/dify', module: IntegrationDifyModule }]),
		ConfigModule,
		IntegrationModule
	],
	controllers: [DifyController],
	providers: [DifyService, DifyKnowledgeStrategy],
	exports: []
})
export class IntegrationDifyModule {}
