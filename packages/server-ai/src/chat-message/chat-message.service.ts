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
		repository: Repository<ChatMessage>,
		readonly commandBus: CommandBus,
		readonly queryBus: QueryBus
	) {
		super(repository)
	}

	async deleteByIds(ids: string[]) {
		for await (const id of ids) {
			await this.softRemove(id)
		}
	}
}
