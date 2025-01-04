import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { ChatConversationService } from '../../conversation.service'
import { ChatConversationUpsertCommand } from '../upsert.command'
import { ChatConversation } from '../../conversation.entity'

@CommandHandler(ChatConversationUpsertCommand)
export class ChatConversationUpsertHandler implements ICommandHandler<ChatConversationUpsertCommand> {
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
		return await this.service.findOne(id, {relations: command.relations})
	}
}
