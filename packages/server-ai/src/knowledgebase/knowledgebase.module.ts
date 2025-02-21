import { forwardRef, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from 'nest-router'
import { DatabaseModule, TenantModule, UserModule } from '@metad/server-core'
import { CopilotModule } from '../copilot/copilot.module'
import { Knowledgebase } from './knowledgebase.entity'
import { KnowledgebaseController } from './knowledgebase.controller'
import { KnowledgebaseService } from './knowledgebase.service'
import { QueryHandlers } from './queries/handlers'
import { CommandHandlers } from './commands/handlers'
import { XpertWorkspaceModule } from '../xpert-workspace'

@Module({
	imports: [
		RouterModule.forRoutes([{ path: '/knowledgebase', module: KnowledgebaseModule }]),
		TypeOrmModule.forFeature([ Knowledgebase ]),
		TenantModule,
		CqrsModule,
		UserModule,
		CopilotModule,
		DatabaseModule,
		forwardRef(() => XpertWorkspaceModule),
	],
	controllers: [KnowledgebaseController],
	providers: [KnowledgebaseService, ...QueryHandlers, ...CommandHandlers],
	exports: [KnowledgebaseService]
})
export class KnowledgebaseModule {}
