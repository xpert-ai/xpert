import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { IsNull, Repository } from 'typeorm'
import { AssertChatConversationAccessQuery } from '../chat-conversation/queries/conversation-assert-access.query'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { AssistantUserPreference } from '../xpert/assistant-user-preference.entity'
import { resolveMonitorDestination } from './conversation-monitor'

@Injectable()
export class MonitorTargets {
    constructor(
        @InjectRepository(ChatConversation) private readonly conversations: Repository<ChatConversation>,
        private readonly queries: QueryBus
    ) {}

    async findReadable(xpertId: string, conversationId: string, threadId?: string) {
        try {
            return await this.queries.execute(
                new AssertChatConversationAccessQuery(
                    {
                        id: conversationId,
                        ...(threadId ? { threadId } : {}),
                        xpertId,
                        tenantId: RequestContext.currentTenantId(),
                        organizationId: RequestContext.getOrganizationId() ?? IsNull(),
                        purpose: 'private'
                    },
                    'read'
                )
            )
        } catch (error) {
            if (error instanceof ForbiddenException || error instanceof NotFoundException) return null
            throw error
        }
    }

    async list(xpertId: string, search = '', offset = 0) {
        const tenantId = RequestContext.currentTenantId(),
            organizationId = RequestContext.getOrganizationId() ?? IsNull(),
            userId = RequestContext.currentUserId()
        if (!userId || !tenantId || !xpertId) throw new ForbiddenException()
        const prefs = await this.conversations.manager
            .getRepository(AssistantUserPreference)
            .findOneBy({ tenantId, organizationId, userId, assistantId: xpertId })
        const states = prefs?.preferences.conversationSidebar ?? {}
        const pinned = Object.keys(states).filter((id) => states[id].pinned && !states[id].archived)
        const archived = Object.keys(states).filter((id) => states[id].archived)
        const query = this.conversations
            .createQueryBuilder('c')
            .leftJoin('c.xpert', 'assistant')
            .where({ tenantId, organizationId, xpertId, purpose: 'private' })
            .andWhere('c.threadId IS NOT NULL')
            .andWhere(
                '(c.projectId IS NOT NULL OR c.createdById = :userId OR (assistant.createdById = :userId AND assistant.userId = c.createdById))',
                { userId }
            )
            .select(['c.id', 'c.title', 'c.threadId', 'c.projectId', 'c.updatedAt'])
        if (search.trim())
            query.andWhere('c.title ILIKE :search', {
                search:
                    '%' +
                    search
                        .trim()
                        .slice(0, 200)
                        .replace(/[\\%_]/g, '\\$&') +
                    '%'
            })
        if (!search.trim() && archived.length) query.andWhere('c.id NOT IN (:...archived)', { archived })
        if (pinned.length)
            query.orderBy('CASE WHEN c.id IN (:...pinned) THEN 0 ELSE 1 END', 'ASC').setParameter('pinned', pinned)
        query.addOrderBy('c.updatedAt', 'DESC').addOrderBy('c.id', 'DESC')
        const items: { conversationId: string; threadId: string; title: string; updatedAt: Date; pinned: boolean }[] =
            []
        const allowedProjects = new Map<string, boolean>()
        let index = Math.max(0, offset)
        for (;;) {
            const rows = await query.clone().offset(index).limit(40).getMany()
            for (const row of rows) {
                if (row.projectId && !allowedProjects.has(row.projectId)) {
                    try {
                        await resolveMonitorDestination(this.queries, xpertId, {
                            type: 'conversation',
                            conversationId: row.id,
                            threadId: row.threadId
                        })
                        allowedProjects.set(row.projectId, true)
                    } catch (error) {
                        if (!(error instanceof ForbiddenException || error instanceof NotFoundException)) throw error
                        allowedProjects.set(row.projectId, false)
                    }
                }
                if (!row.projectId || allowedProjects.get(row.projectId)) {
                    if (items.length === 20) return { items, nextOffset: index }
                    items.push({
                        conversationId: row.id,
                        threadId: row.threadId,
                        title: row.title ?? '',
                        updatedAt: row.updatedAt,
                        pinned: Boolean(states[row.id]?.pinned)
                    })
                }
                index++
            }
            if (rows.length < 40) return { items, nextOffset: null }
        }
    }
}
