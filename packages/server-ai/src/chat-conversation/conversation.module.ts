import { SharedModule, StorageFileModule } from '@xpert-ai/server-core'
import { BullModule } from '@nestjs/bull'
import { Module, forwardRef } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from '@nestjs/core'
import { CommandHandlers } from './commands/handlers'
import { ChatConversationController } from './conversation.controller'
import { ChatConversation } from './conversation.entity'
import { ChatConversationService } from './conversation.service'
import { QueryHandlers } from './queries/handlers'
import { ConversationSummaryProcessor } from './summary.job'
import { ChatMessageModule } from '../chat-message/chat-message.module'
import { ExecutionCancelModule } from '../shared'
import { XpertAgentExecutionModule } from '../xpert-agent-execution'
import { SuperAdminOrganizationScopeModule } from '../shared/super-admin-organization-scope.module'

@Module({
	imports: [
		RouterModule.register([{ path: '/chat-conversation', module: ChatConversationModule }]),
		TypeOrmModule.forFeature([ChatConversation]),
		SharedModule,
		CqrsModule,

		BullModule.registerQueue({
			name: 'conversation-summary'
		}),
		forwardRef(() => StorageFileModule),
		forwardRef(() => ChatMessageModule),
		ExecutionCancelModule,
		SuperAdminOrganizationScopeModule,
		XpertAgentExecutionModule,
	],
	controllers: [ChatConversationController],
	providers: [ChatConversationService, ConversationSummaryProcessor, ...CommandHandlers, ...QueryHandlers],
	exports: [ChatConversationService]
})
export class ChatConversationModule {}
