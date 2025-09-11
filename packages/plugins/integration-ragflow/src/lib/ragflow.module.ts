import { ConfigModule } from '@nestjs/config'
import { Module } from '@nestjs/common'
import { RouterModule } from '@nestjs/core'
import { RAGFlowKnowledgeStrategy } from './ragflow-knowledge.strategy'
import { RAGFlowController } from './ragflow.controller'
import { RAGFlowService } from './ragflow.service'
import { RAGFlowIntegrationStrategy } from './ragflow-integration.strategy'

@Module({
	imports: [
		RouterModule.register([{ path: '/ragflow', module: IntegrationRAGFlowModule }]),
		ConfigModule,
	],
	controllers: [RAGFlowController],
	providers: [RAGFlowService, RAGFlowIntegrationStrategy, RAGFlowKnowledgeStrategy],
	exports: []
})
export class IntegrationRAGFlowModule {}
