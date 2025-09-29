import { DatabaseModule, IntegrationModule, TenantModule, UserModule } from '@metad/server-core'
import { forwardRef, Module } from '@nestjs/common'
import { DiscoveryModule, RouterModule } from '@nestjs/core'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import {
	DocumentSourceRegistry,
	DocumentTransformerRegistry,
	ImageUnderstandingRegistry,
	KnowledgeStrategyRegistry,
	TextSplitterRegistry
} from '@xpert-ai/plugin-sdk'
import { CopilotModule } from '../copilot/copilot.module'
import { KnowledgeDocumentModule } from '../knowledge-document/document.module'
import { XpertWorkspaceModule } from '../xpert-workspace'
import { CommandHandlers } from './commands/handlers'
import { KnowledgebaseController } from './knowledgebase.controller'
import { Knowledgebase } from './knowledgebase.entity'
import { KnowledgebaseService } from './knowledgebase.service'
import { QueryHandlers } from './queries/handlers'
import { XpertModule } from '../xpert/xpert.module'
import { KnowledgebaseTaskService } from './task/task.service'
import { KnowledgebaseTask } from './task/task.entity'
import { Validators, Strategies } from './plugins'

@Module({
	imports: [
		RouterModule.register([{ path: '/knowledgebase', module: KnowledgebaseModule }]),
		TypeOrmModule.forFeature([Knowledgebase, KnowledgebaseTask]),
		DiscoveryModule,
		TenantModule,
		CqrsModule,
		UserModule,
		CopilotModule,
		DatabaseModule,
		forwardRef(() => XpertWorkspaceModule),
		forwardRef(() => IntegrationModule),
		forwardRef(() => KnowledgeDocumentModule),
		forwardRef(() => XpertModule),
	],
	controllers: [KnowledgebaseController],
	providers: [
		KnowledgebaseService,
		KnowledgebaseTaskService,
		DocumentSourceRegistry,
		KnowledgeStrategyRegistry,
		TextSplitterRegistry,
		DocumentTransformerRegistry,
		ImageUnderstandingRegistry,
		...QueryHandlers,
		...CommandHandlers,
		...Strategies,
		...Validators
	],
	exports: [
		KnowledgebaseService,
		KnowledgebaseTaskService,
		DocumentSourceRegistry,
		TextSplitterRegistry,
		DocumentTransformerRegistry,
		ImageUnderstandingRegistry
	]
})
export class KnowledgebaseModule {}
