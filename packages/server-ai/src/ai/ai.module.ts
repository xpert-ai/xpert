import { StorageFileModule, TenantModule } from '@metad/server-core'
import { forwardRef, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { RouterModule } from 'nest-router'
import { CopilotModule } from '../copilot'
import { CopilotOrganizationModule } from '../copilot-organization/index'
import { CopilotUserModule } from '../copilot-user/index'
import { KnowledgebaseModule } from '../knowledgebase'
import { AIV1Controller } from './ai-v1.controller'
import { AIController } from './ai.controller'
import { AiService } from './ai.service'
import { CommandHandlers } from './commands/handlers'
import { QueryHandlers } from './queries/handlers'
import { ThreadsController } from './thread.controller'
import { KnowledgeDocumentModule } from '../knowledge-document'

@Module({
	imports: [
		RouterModule.forRoutes([
			{
				path: '/ai',
				module: AIModule
			}
		]),
		TenantModule,
		CqrsModule,
		CopilotModule,
		CopilotUserModule,
		CopilotOrganizationModule,
		forwardRef(() => KnowledgebaseModule),
		forwardRef(() => KnowledgeDocumentModule),
		forwardRef(() => StorageFileModule),
	],
	controllers: [AIController, AIV1Controller, ThreadsController],
	providers: [AiService, ...CommandHandlers, ...QueryHandlers]
})
export class AIModule {}
