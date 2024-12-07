import { PaginationParams, TenantOrganizationAwareCrudService } from '@metad/server-core'
import { Injectable, Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { DeepPartial, Repository } from 'typeorm'
import { FindAgentExecutionsQuery } from '../xpert-agent-execution/queries'
import { ChatConversation } from './conversation.entity'
import { ChatConversationPublicDTO } from './dto'

@Injectable()
export class ChatConversationService extends TenantOrganizationAwareCrudService<ChatConversation> {
	private readonly logger = new Logger(ChatConversationService.name)

	constructor(
		@InjectRepository(ChatConversation)
		chatRepository: Repository<ChatConversation>,
		readonly commandBus: CommandBus,
		readonly queryBus: QueryBus
	) {
		super(chatRepository)
	}

	async findAllByXpert(xpertId: string, options: PaginationParams<ChatConversation>) {
		return this.findAll({
			...options,
			where: {
				xpertId
			}
		})
	}

	async findOneDetail(id: string, options: DeepPartial<PaginationParams<ChatConversation>>) {
		// Split executions relation
		const { relations } = options ?? {}
		const entity = await this.findOne(id, { ...(options ?? {}), relations: relations?.filter((_) => _ !== 'executions') })

		let executions = null
		if (relations?.includes('executions')) {
			const result = await this.queryBus.execute(
				new FindAgentExecutionsQuery({ where: { threadId: entity.threadId } })
			)
			executions = result.items
		}

		return new ChatConversationPublicDTO({
			...entity,
			executions
		})
	}
}
