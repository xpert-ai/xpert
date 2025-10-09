import { TChatConversationLog } from '@metad/contracts'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { FindOptionsRelationByString, Repository } from 'typeorm'
import { ChatConversation } from '../../conversation.entity'
import { ChatConversationService } from '../../conversation.service'
import { ChatConversationLogsQuery } from '../conversation-logs.query'

@QueryHandler(ChatConversationLogsQuery)
export class ChatConversationLogsHandler implements IQueryHandler<ChatConversationLogsQuery, { items: TChatConversationLog[]; total: number }> {
	constructor(
		@InjectRepository(ChatConversation)
		public repository: Repository<ChatConversation>,
		private readonly service: ChatConversationService) {}

	public async execute(command: ChatConversationLogsQuery) {
		const { where, skip, take, order } = command.options
		const relations = command.options.relations as FindOptionsRelationByString

		const repository = this.repository

		const query = repository
			.createQueryBuilder('conversation')
			.leftJoin('conversation.messages', 'message')
			.loadRelationCountAndMap('conversation.messageCount', 'conversation.messages')
			.where(where)

		relations
			.filter((_) => _ !== 'messages')
			.forEach((relation) => {
				query.leftJoinAndSelect('conversation.' + relation, relation.replace(/\./g, '_'))
			})

		if (order) {
			Object.entries(order).forEach(([name, order]) => {
				query.orderBy(`conversation.${name}`, order as 'ASC' | 'DESC')
			})
		}

		if (skip) {
			query.skip(skip)
		}

		if (take) {
			query.take(take)
		}

		const items = await query.getMany()
		return {
			items: items as unknown as TChatConversationLog[],
			total: await this.service.count(command.options)
		}
	}
}
