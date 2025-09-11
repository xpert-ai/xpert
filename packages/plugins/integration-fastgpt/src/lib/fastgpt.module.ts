import { ConfigModule } from '@nestjs/config'
import { IntegrationModule } from '@metad/server-core'
import { Module } from '@nestjs/common'
import { RouterModule } from '@nestjs/core'
import { FastGPTController } from './fastgpt.controller'
import { FastGPTService } from './fastgpt.service'
import { FastGPTKnowledgeStrategy } from './fastgpt-knowledge.strategy'
import { FastGPTIntegrationStrategy } from './fastgpt-integration.strategy'

@Module({
	imports: [
		RouterModule.register([{ path: '/fastgpt', module: IntegrationFastGPTModule }]),
		ConfigModule,
		IntegrationModule
	],
	controllers: [FastGPTController],
	providers: [FastGPTService, FastGPTIntegrationStrategy, FastGPTKnowledgeStrategy],
	exports: []
})
export class IntegrationFastGPTModule {}
