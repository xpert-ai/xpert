import { CrudController, TransformInterceptor } from '@metad/server-core'
import { Controller, UseInterceptors } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { ChatMessageFeedback } from './feedback.entity'
import { ChatMessageFeedbackService } from './feedback.service'

@ApiTags('ChatMessageFeedback')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class ChatMessageFeedbackController extends CrudController<ChatMessageFeedback> {
	constructor(
		private readonly service: ChatMessageFeedbackService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {
		super(service)
	}
}
