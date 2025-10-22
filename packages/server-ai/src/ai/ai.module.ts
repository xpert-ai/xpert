import { StorageFileModule, TenantModule } from '@metad/server-core'
import { forwardRef, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { RouterModule } from '@nestjs/core'
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
import { AssistantsController } from './assistant.controller'
import { XpertModule } from '../xpert'
import { StoreController } from './store.controller'
import { ContextsController } from './context.controller'
import { KnowledgesController } from './knowledge.controller'

@Module({
	imports: [
		RouterModule.register([
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
		forwardRef(() => XpertModule)
	],
	controllers: [
		AIController,
		AIV1Controller,
		ContextsController,
		KnowledgesController,
		AssistantsController,
		ThreadsController,
		StoreController,
		
	],
	providers: [AiService, ...CommandHandlers, ...QueryHandlers]
})
export class AIModule {}
