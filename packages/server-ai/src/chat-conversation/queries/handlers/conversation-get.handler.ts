import { IChatConversation } from '@metad/contracts'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { ChatConversationService } from '../../conversation.service'
import { GetChatConversationQuery } from '../conversation-get.query'

@QueryHandler(GetChatConversationQuery)
export class GetChatConversationHandler implements IQueryHandler<GetChatConversationQuery> {
	constructor(private readonly service: ChatConversationService) {}

	public async execute(command: GetChatConversationQuery): Promise<IChatConversation> {
		const result = await this.service.findOneOrFail({ where: command.conditions, relations: command.relations })
		return result.record
	}
}
