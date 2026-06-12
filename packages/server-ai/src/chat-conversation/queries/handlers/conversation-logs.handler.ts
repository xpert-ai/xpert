import { TChatConversationLog } from '@xpert-ai/contracts'
import { User } from '@xpert-ai/server-core'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Brackets, FindOptionsRelationByString, Repository } from 'typeorm'
import { ChatConversation } from '../../conversation.entity'
import { ChatConversationService } from '../../conversation.service'
import { ChatConversationLogsQuery } from '../conversation-logs.query'

@QueryHandler(ChatConversationLogsQuery)
export class ChatConversationLogsHandler implements IQueryHandler<
    ChatConversationLogsQuery,
    { items: TChatConversationLog[]; total: number }
> {
    constructor(
        @InjectRepository(ChatConversation)
        public repository: Repository<ChatConversation>,
        private readonly service: ChatConversationService
    ) {}

    public async execute(command: ChatConversationLogsQuery) {
        const { where, skip, take, order } = command.options
        const relations = (command.options.relations ?? []) as FindOptionsRelationByString
        const search = command.search?.trim()

        const repository = this.repository
        const relationSet = new Set(relations)

        const query = repository
            .createQueryBuilder('conversation')
            .leftJoin('conversation.messages', 'message')
            .leftJoinAndMapOne(
                'conversation.fromEndUser',
                User,
                'fromEndUser',
                'CAST(fromEndUser.id AS text) = conversation.fromEndUserId'
            )
            .loadRelationCountAndMap('conversation.messageCount', 'conversation.messages')
            .where(where)

        if (relationSet.has('createdBy')) {
            query.leftJoinAndSelect('conversation.createdBy', 'createdBy')
        } else if (search) {
            query.leftJoin('conversation.createdBy', 'createdBy')
        }

        relations
            .filter((_) => _ !== 'messages' && _ !== 'createdBy')
            .forEach((relation) => {
                query.leftJoinAndSelect('conversation.' + relation, relation.replace(/\./g, '_'))
            })

        if (search) {
            query.andWhere(
                new Brackets((qb) => {
                    qb.where('conversation.title ILIKE :search', { search: `%${search}%` })
                        .orWhere('CAST(conversation.id AS text) ILIKE :search', { search: `%${search}%` })
                        .orWhere('conversation.threadId ILIKE :search', { search: `%${search}%` })
                        .orWhere('conversation.fromEndUserId ILIKE :search', { search: `%${search}%` })
                        .orWhere('createdBy.firstName ILIKE :search', { search: `%${search}%` })
                        .orWhere('createdBy.lastName ILIKE :search', { search: `%${search}%` })
                        .orWhere('createdBy.username ILIKE :search', { search: `%${search}%` })
                        .orWhere('createdBy.email ILIKE :search', { search: `%${search}%` })
                })
            )
        }

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

        const [items, total] = await query.getManyAndCount()
        return {
            items: items as unknown as TChatConversationLog[],
            total
        }
    }
}
