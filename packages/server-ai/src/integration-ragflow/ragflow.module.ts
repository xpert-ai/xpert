import { ConfigModule } from '@nestjs/config'
import { IntegrationModule } from '@metad/server-core'
import { Module } from '@nestjs/common'
import { RouterModule } from 'nest-router'
import { RAGFlowKnowledgeStrategy } from './ragflow-knowledge.strategy'
import { RAGFlowController } from './ragflow.controller'
import { RAGFlowService } from './ragflow.service'

@Module({
	imports: [
		RouterModule.forRoutes([{ path: '/ragflow', module: IntegrationRAGFlowModule }]),
		ConfigModule,
		IntegrationModule
	],
	controllers: [RAGFlowController],
	providers: [RAGFlowService, RAGFlowKnowledgeStrategy],
	exports: []
})
export class IntegrationRAGFlowModule {}
