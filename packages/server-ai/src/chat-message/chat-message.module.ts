import { forwardRef, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from 'nest-router'
import { ChatMessage } from './chat-message.entity'
import { TenantModule } from '@metad/server-core'
import { SharedModule } from '@metad/server-core'
import { CopilotCheckpointModule } from '../copilot-checkpoint'
import { ChatMessageController } from './chat-message.controller'
import { ChatMessageService } from './chat-message.service'
import { CommandHandlers } from './commands/handlers'

@Module({
	imports: [
		RouterModule.forRoutes([{ path: '/chat-message', module: ChatMessageModule }]),
		forwardRef(() => TypeOrmModule.forFeature([ChatMessage])),
		forwardRef(() => TenantModule),
		SharedModule,
		CqrsModule,
		CopilotCheckpointModule
	],
	controllers: [ChatMessageController],
	providers: [ChatMessageService, ...CommandHandlers]
})
export class ChatMessageModule {}
