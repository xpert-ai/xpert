import { forwardRef, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { DiscoveryModule } from '@nestjs/core'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from 'nest-router'
import { DatabaseModule, IntegrationModule, TenantModule, UserModule } from '@metad/server-core'
import { CopilotModule } from '../copilot/copilot.module'
import { Knowledgebase } from './knowledgebase.entity'
import { KnowledgebaseController } from './knowledgebase.controller'
import { KnowledgebaseService } from './knowledgebase.service'
import { QueryHandlers } from './queries/handlers'
import { CommandHandlers } from './commands/handlers'
import { XpertWorkspaceModule } from '../xpert-workspace'
import { KnowledgeStrategyRegistry } from './strategy/knowledge-strategy.registry'

@Module({
	imports: [
		RouterModule.forRoutes([{ path: '/knowledgebase', module: KnowledgebaseModule }]),
		TypeOrmModule.forFeature([ Knowledgebase ]),
		DiscoveryModule,
		TenantModule,
		CqrsModule,
		UserModule,
		CopilotModule,
		DatabaseModule,
		forwardRef(() => XpertWorkspaceModule),
		forwardRef(() => IntegrationModule),
	],
	controllers: [KnowledgebaseController],
	providers: [KnowledgebaseService, KnowledgeStrategyRegistry, ...QueryHandlers, ...CommandHandlers],
	exports: [KnowledgebaseService]
})
export class KnowledgebaseModule {}
