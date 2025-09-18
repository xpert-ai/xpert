import { DatabaseModule, IntegrationModule, TenantModule, UserModule } from '@metad/server-core'
import { forwardRef, Module } from '@nestjs/common'
import { DiscoveryModule, RouterModule } from '@nestjs/core'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DocumentTransformerRegistry, KnowledgeStrategyRegistry, TextSplitterRegistry } from '@xpert-ai/plugin-sdk'
import { CopilotModule } from '../copilot/copilot.module'
import { XpertWorkspaceModule } from '../xpert-workspace'
import { CommandHandlers } from './commands/handlers'
import { KnowledgebaseController } from './knowledgebase.controller'
import { Knowledgebase } from './knowledgebase.entity'
import { KnowledgebaseService } from './knowledgebase.service'
import { QueryHandlers } from './queries/handlers'

@Module({
	imports: [
		RouterModule.register([{ path: '/knowledgebase', module: KnowledgebaseModule }]),
		TypeOrmModule.forFeature([Knowledgebase]),
		DiscoveryModule,
		TenantModule,
		CqrsModule,
		UserModule,
		CopilotModule,
		DatabaseModule,
		forwardRef(() => XpertWorkspaceModule),
		forwardRef(() => IntegrationModule)
	],
	controllers: [KnowledgebaseController],
	providers: [KnowledgebaseService, KnowledgeStrategyRegistry, TextSplitterRegistry, DocumentTransformerRegistry, ...QueryHandlers, ...CommandHandlers],
	exports: [KnowledgebaseService, TextSplitterRegistry, DocumentTransformerRegistry]
})
export class KnowledgebaseModule {}
