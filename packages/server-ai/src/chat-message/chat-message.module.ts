import { SharedModule } from '@metad/server-core'
import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from '@nestjs/core'
import { ChatMessageController } from './chat-message.controller'
import { ChatMessage } from './chat-message.entity'
import { ChatMessageService } from './chat-message.service'
import { CommandHandlers } from './commands/handlers'

@Module({
	imports: [
		RouterModule.register([{ path: '/chat-message', module: ChatMessageModule }]),
		TypeOrmModule.forFeature([ChatMessage]),
		SharedModule,
		CqrsModule
	],
	controllers: [ChatMessageController],
	providers: [ChatMessageService, ...CommandHandlers],
	exports: [ChatMessageService]
})
export class ChatMessageModule {}
