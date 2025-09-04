import { ConfigModule } from '@nestjs/config'
import { IntegrationModule } from '@metad/server-core'
import { Module } from '@nestjs/common'
import { RouterModule } from 'nest-router'
import { DifyController } from './dify.controller'
import { DifyService } from './dify.service'
import { DifyKnowledgeStrategy } from './dify-knowledge.strategy'

@Module({
	imports: [
		RouterModule.forRoutes([{ path: '/dify', module: IntegrationDifyModule }]),
		ConfigModule,
		IntegrationModule
	],
	controllers: [DifyController],
	providers: [DifyService, DifyKnowledgeStrategy],
	exports: []
})
export class IntegrationDifyModule {}
