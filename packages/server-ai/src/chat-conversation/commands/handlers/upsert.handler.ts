import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { ChatConversationService } from '../../conversation.service'
import { ChatConversationUpsertCommand } from '../upsert.command'
import { ChatConversation } from '../../conversation.entity'

@CommandHandler(ChatConversationUpsertCommand)
export class ChatConversationUpsertHandler implements ICommandHandler<ChatConversationUpsertCommand> {
	private readonly logger = new Logger(ChatConversationUpsertHandler.name)

	constructor(
		private readonly service: ChatConversationService,
		private readonly commandBus: CommandBus
	) {}

	public async execute(command: ChatConversationUpsertCommand): Promise<ChatConversation> {
		const entity = command.entity

		let id = entity.id
		if (id) {
			await this.service.update(entity.id, entity as ChatConversation)
		} else {
			const newEntity = await this.service.create(entity)
			id = newEntity.id
		}

		try {
			return await this.service.findOne(id, {relations: command.relations})
		} catch (error: any) {
			if (error?.status === 404 || error?.response?.statusCode === 404) {
				this.logger.debug(`Scoped conversation findOne missed id=${id}, falling back to id-only lookup`)
				const record = await this.service.findOneByIdAnyScope(id, {relations: command.relations})
				if (record) {
					return record
				}
			}
			throw error
		}
	}
}
