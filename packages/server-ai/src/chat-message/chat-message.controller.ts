import { CrudController, TransformInterceptor, UUIDValidationPipe } from '@metad/server-core'
import { Controller, Get, Param, UseInterceptors } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { ChatMessage } from './chat-message.entity'
import { ChatMessageService } from './chat-message.service'
import { SuggestedQuestionsCommand } from './commands/'

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

	@Get(':id/suggested-questions')
	async suggestedQuestions(@Param('id', UUIDValidationPipe) id: string) {
		return this.commandBus.execute(new SuggestedQuestionsCommand({ messageId: id }))
	}
}
