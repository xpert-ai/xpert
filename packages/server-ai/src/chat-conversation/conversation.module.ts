import { SharedModule, StorageFileModule } from '@metad/server-core'
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
import { CopilotCheckpoint } from '../copilot-checkpoint/copilot-checkpoint.entity'

@Module({
	imports: [
		RouterModule.register([{ path: '/chat-conversation', module: ChatConversationModule }]),
		// Provide checkpoint repository for rollback logic
		TypeOrmModule.forFeature([ChatConversation, CopilotCheckpoint]),
		SharedModule,
		CqrsModule,

		BullModule.registerQueue({
			name: 'conversation-summary'
		}),
		forwardRef(() => StorageFileModule),
		forwardRef(() => ChatMessageModule),
	],
	controllers: [ChatConversationController],
	providers: [ChatConversationService, ConversationSummaryProcessor, ...CommandHandlers, ...QueryHandlers],
	exports: [ChatConversationService]
})
export class ChatConversationModule {}
