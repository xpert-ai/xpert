import { UserType, ChatGroupSummary, ChatGroupCandidate, XpertTypeEnum } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { DataSource, In, IsNull } from 'typeorm'
import { UserOrganization } from '@xpert-ai/server-core'
import { GroupAccessService } from './group-access.service'
import { PublishedXpertAccessService } from '../xpert/published-xpert-access.service'
import { GroupParticipant } from './group.entity'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { publicMembers } from './group-members.service'
import { groupUserName } from './group-user-name'
import { Xpert } from '../xpert/xpert.entity'

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
                    return {
                        id: member.id,
                        kind: member.kind,
                        name: profile?.name ?? member.name,
                        avatar: profile?.avatar
                    }
                }),
                pinned: preference.pinned,
                archived: preference.archived,
                unread: group.lastMessageSequence > preference.readSequence
            }
        })
    }
    /** Use existing published-Assistant access; invitations to an existing group require its owner. */
    async candidates(
        kind: 'user' | 'assistant',
        search = '',
        groupId?: string,
        page: { limit: number; offset: number } = { limit: 50, offset: 0 }
    ): Promise<ChatGroupCandidate[]> {
        const { tenantId, organizationId, userId } = this.access.scope()
        await this.access.user({ tenantId, organizationId }, userId)
        if (groupId) await this.access.authorize(groupId, true)
        const members = groupId
            ? await this.db.getRepository(GroupParticipant).find({
                  where: { tenantId, organizationId, groupId, kind, active: true },
                  select: { subjectId: true }
              })
            : []
        const memberIds = members.map((member) => member.subjectId)
        if (kind === 'assistant') {
            const items = await this.assistants.findAccessiblePublishedXperts({
                where: { type: XpertTypeEnum.Agent, latest: true },
                search,
                order: { createdAt: 'DESC', id: 'ASC' },
                take: page.limit,
                skip: page.offset,
                excludeIds: await this.assistantFamilyIds(tenantId, memberIds)
            })
            return items.map((assistant) => ({
                subjectId: assistant.id,
                name: assistant.title || assistant.titleCN || assistant.name || assistant.slug || assistant.id,
                avatar: assistant.avatar ?? null,
                kind: 'assistant' as const
            }))
        }
        const query = this.db
            .getRepository(UserOrganization)
            .createQueryBuilder('membership')
            .innerJoinAndSelect('membership.user', 'user')
            .where({ tenantId, organizationId, isActive: true })
            .andWhere('user.type = :type', { type: UserType.USER })
        if (memberIds.length) query.andWhere('user.id NOT IN (:...memberIds)', { memberIds })
        const term = search.trim()
        if (term) {
            query.andWhere(
                '(user.firstName ILIKE :search OR user.lastName ILIKE :search OR user.email ILIKE :search OR user.username ILIKE :search)',
                { search: `%${term.replace(/[%_\\]/g, '\\$&')}%` }
            )
        }
        const rows = await query
            .orderBy('membership.userId', 'ASC')
            .addOrderBy('membership.id', 'ASC')
            .take(page.limit)
            .skip(page.offset)
            .getMany()
        return rows.map((row) => ({
            subjectId: row.user.id,
            name: groupUserName(row.user),
            avatar: row.user.imageUrl ? { url: row.user.imageUrl } : null,
            kind: 'user' as const
        }))
    }
    /** An existing historical version excludes its current version too, within the same resource family. */
    private async assistantFamilyIds(tenantId: string, memberIds: string[]): Promise<string[]> {
        if (!memberIds.length) return []
        const repository = this.db.getRepository(Xpert)
        const members = await repository.find({
            where: { id: In(memberIds), tenantId },
            select: { id: true, tenantId: true, organizationId: true, workspaceId: true, type: true, slug: true },
            withDeleted: true
        })
        const families = members
            .filter((member) => member.slug)
            .map((member) => ({
                tenantId,
                organizationId: member.organizationId ?? IsNull(),
                workspaceId: member.workspaceId ?? IsNull(),
                type: member.type,
                slug: member.slug,
                latest: true
            }))
        const latest = families.length ? await repository.find({ where: families, select: { id: true } }) : []
        return [...new Set([...memberIds, ...latest.map((assistant) => assistant.id)])]
    }
}
