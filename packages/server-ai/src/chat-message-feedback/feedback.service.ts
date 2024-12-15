import { TenantOrganizationAwareCrudService } from '@metad/server-core'
import { Injectable, Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ChatMessageFeedback } from './feedback.entity'

@Injectable()
export class ChatMessageFeedbackService extends TenantOrganizationAwareCrudService<ChatMessageFeedback> {
	private readonly logger = new Logger(ChatMessageFeedbackService.name)

	constructor(
		@InjectRepository(ChatMessageFeedback)
		chatRepository: Repository<ChatMessageFeedback>,
		readonly commandBus: CommandBus,
		readonly queryBus: QueryBus
	) {
		super(chatRepository)
	}
}
