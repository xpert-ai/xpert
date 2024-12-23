import { CrudController, TransformInterceptor } from '@metad/server-core'
import { Controller, UseInterceptors } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { ChatMessage } from './chat-message.entity'
import { ChatMessageService } from './chat-message.service'

@ApiTags('ChatMessage')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class ChatMessageController extends CrudController<ChatMessage> {
	constructor(
		private readonly service: ChatMessageService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {
		super(service)
	}
}
