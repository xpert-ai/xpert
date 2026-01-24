import { TenantOrganizationAwareCrudService } from '@metad/server-core'
import { Injectable, Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ChatMessage } from './chat-message.entity'

@Injectable()
export class ChatMessageService extends TenantOrganizationAwareCrudService<ChatMessage> {
	private readonly logger = new Logger(ChatMessageService.name)

	constructor(
		@InjectRepository(ChatMessage)
		private readonly chatRepository: Repository<ChatMessage>,
		readonly commandBus: CommandBus,
		readonly queryBus: QueryBus
	) {
		super(chatRepository)
	}

	async deleteByIds(ids: string[]) {
		// Delete messages by ids in a single query
		if (!ids?.length) {
			return
		}
		await this.chatRepository.delete(ids)
	}
}
