import { UserType, ChatGroupSummary, ChatGroupCandidate } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { DataSource, In } from 'typeorm'
import { UserOrganization } from '@xpert-ai/server-core'
import { GroupAccessService } from './group-access.service'
import { PublishedXpertAccessService } from '../xpert/published-xpert-access.service'
import { GroupParticipant } from './group.entity'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { publicMembers } from './group-members.service'

/** Member-scoped sidebar data and invitation candidates; private runtime details never leave this service. */
@Injectable()
export class GroupCatalogService {
    constructor(
        private readonly db: DataSource,
        private readonly access: GroupAccessService,
        private readonly assistants: PublishedXpertAccessService
    ) {}
    /** Read recent groups for the current human, including personal unread/pin/archive state. */
    async list(): Promise<ChatGroupSummary[]> {
        const { tenantId, organizationId, userId } = this.access.scope()
        await this.access.user({ tenantId, organizationId }, userId)
        const memberships = await this.db
            .getRepository(GroupParticipant)
            .findBy({ tenantId, organizationId, kind: 'user', subjectId: userId, active: true })
        if (!memberships.length) return []
        const groups = await this.db.getRepository(ChatConversation).find({
            where: {
                id: In(memberships.map((member) => member.groupId)),
                tenantId,
                organizationId,
                purpose: 'group'
            },
            order: { updatedAt: 'DESC' },
            take: 100
        })
        if (!groups.length) return []
        const groupIds = groups.map((group) => group.id)
        const [members, latestMessages] = await Promise.all([
            this.db.getRepository(GroupParticipant).find({
                where: { groupId: In(groupIds), tenantId, organizationId, active: true },
                order: { createdAt: 'ASC', id: 'ASC' }
            }),
            this.db
                .getRepository(ChatMessage)
                .createQueryBuilder('message')
                .select(['message.id', 'message.conversationId', 'message.content', 'message.createdAt'])
                .where({ conversationId: In(groupIds), tenantId, organizationId })
                .distinctOn(['message.conversationId'])
                .orderBy('message.conversationId', 'ASC')
                .addOrderBy('message.sequence', 'DESC')
                .getMany()
        ])
        const profiles = await publicMembers(this.db, { tenantId, organizationId }, members)
        return groups.map((group) => {
            const preference = memberships.find((member) => member.groupId === group.id)
            const participants = members.filter((member) => member.groupId === group.id)
            const latest = latestMessages.find((message) => message.conversationId === group.id)
            return {
                purpose: 'group',
                id: group.id,
                threadId: group.threadId,
                title: group.title,
                updatedAt: (latest?.createdAt ?? group.updatedAt).toISOString(),
                lastMessage: typeof latest?.content === 'string' ? latest.content.slice(0, 240) : '',
                memberCount: participants.length,
                members: participants.slice(0, 4).map((member) => {
                    const profile = profiles.find((item) => item.id === member.id)
                    return { id: member.id, kind: member.kind, name: member.name, avatar: profile?.avatar }
                }),
                pinned: preference.pinned,
                archived: preference.archived,
                unread: group.lastMessageSequence > preference.readSequence
            }
        })
    }
    /** Use existing published-Assistant access; invitations to an existing group require its owner. */
    async candidates(kind: 'user' | 'assistant', search = '', groupId?: string): Promise<ChatGroupCandidate[]> {
        const { tenantId, organizationId, userId } = this.access.scope()
        await this.access.user({ tenantId, organizationId }, userId)
        if (groupId) await this.access.authorize(groupId, true)
        if (kind === 'assistant') {
            const items = await this.assistants.findAccessiblePublishedXperts({ search, take: 50 })
            return items.map((assistant) => ({
                subjectId: assistant.id,
                name: assistant.title || assistant.name,
                avatar: assistant.avatar ?? null,
                kind: 'assistant' as const
            }))
        }
        const rows = await this.db
            .getRepository(UserOrganization)
            .createQueryBuilder('membership')
            .innerJoinAndSelect('membership.user', 'user')
            .where({ tenantId, organizationId, isActive: true })
            .andWhere('user.type = :type', { type: UserType.USER })
            .andWhere('(user.firstName ILIKE :search OR user.lastName ILIKE :search)', {
                search: `%${search.replace(/[%_\\]/g, '\\$&')}%`
            })
            .take(50)
            .getMany()
        return rows.map((row) => ({
            subjectId: row.user.id,
            name: row.user.name || row.user.firstName || row.user.id,
            avatar: row.user.imageUrl ? { url: row.user.imageUrl } : null,
            kind: 'user' as const
        }))
    }
}
