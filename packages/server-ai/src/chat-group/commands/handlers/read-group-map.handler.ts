// Invariants: derive the group from the persisted host runtime, not query IDs or a shared Project.
// Expose public message relationships only; no private prompts, tools, execution IDs or credentials.
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { DataSource, In } from 'typeorm'
import { ChatConversation } from '../../../chat-conversation/conversation.entity'
import { ChatMessage } from '../../../chat-message/chat-message.entity'
import { chatMessageText } from '../../../shared/chat-message-text'
import { GroupAccessService } from '../../group-access.service'
import { GroupParticipant } from '../../group.entity'
import { groupDenied } from '../../group.errors'
import { parseGroupCommunication } from '../../group.schema'
import { groupDisplayContent } from '../../group-display'
import { publicMembers } from '../../group-members.service'
import type { GroupMapMessage } from '../../group-map.schema'
import { ReadGroupMapCommand } from '../read-group-map.command'

@CommandHandler(ReadGroupMapCommand)
export class ReadGroupMapHandler implements ICommandHandler<ReadGroupMapCommand> {
    constructor(
        private readonly db: DataSource,
        private readonly access: GroupAccessService
    ) {}

    async execute({ context, query }: ReadGroupMapCommand) {
        if (
            context.hostType !== 'agent' ||
            context.userId !== RequestContext.currentUserId() ||
            context.tenantId !== RequestContext.currentTenantId() ||
            context.organizationId !== RequestContext.getOrganizationId()
        )
            throw groupDenied()
        const conversationId = context.runtimeScope?.conversationId
        if (!conversationId) return null
        const scope = { tenantId: context.tenantId, organizationId: context.organizationId }
        const runtime = await this.db.getRepository(ChatConversation).findOneBy({ ...scope, id: conversationId })
        if (!runtime) throw groupDenied()
        if (runtime.purpose === 'private') return null
        if (
            !runtime.threadId ||
            !context.organizationId ||
            runtime.purpose !== 'group_assistant_runtime' ||
            runtime.xpertId !== context.hostId ||
            (runtime.projectId ?? null) !== (context.runtimeScope?.projectId ?? null)
        )
            throw groupDenied()
        const hostMember = await this.db.getRepository(GroupParticipant).findOneBy({
            ...scope,
            runtimeConversationId: runtime.id,
            runtimeThreadId: runtime.threadId,
            subjectId: context.hostId,
            kind: 'assistant',
            active: true
        })
        if (!hostMember) throw groupDenied()
        const { group } = await this.access.authorize(hostMember.groupId)
        if (group.xpertId !== context.hostId) throw groupDenied()
        const members = await this.db.getRepository(GroupParticipant).find({
            where: { ...scope, groupId: group.id },
            order: { createdAt: 'ASC', id: 'ASC' }
        })
        if (query.participantId && !members.some((member) => member.id === query.participantId)) throw groupDenied()
        const messages = this.db.getRepository(ChatMessage)
        const builder = messages.createQueryBuilder('message').where({ ...scope, conversationId: group.id })
        if (query.before) builder.andWhere('message.sequence < :before', { before: query.before })
        if (query.participantId)
            builder.andWhere(`message."groupCommunication" ->> 'senderId' = :sender`, { sender: query.participantId })
        if (query.search)
            builder.andWhere('CAST(message.content AS text) ILIKE :search', {
                search: `%${query.search.replace(/[\\%_]/g, '\\$&')}%`
            })
        const rows = await builder
            .orderBy('message.sequence', 'DESC')
            .take(query.limit + 1)
            .getMany()
        const page = rows.slice(0, query.limit).reverse()
        const projected = page.map((message) => {
            const communication = parseGroupCommunication(message.groupCommunication)
            const parentId =
                communication.replyToMessageId ?? communication.causedByMessageId ?? communication.rootMessageId
            return { message, communication, parentId }
        })
        const parentIds = [...new Set(projected.map((item) => item.parentId))]
        const parents = parentIds.length
            ? await messages.find({
                  where: { ...scope, conversationId: group.id, id: In(parentIds) },
                  select: { id: true, sequence: true }
              })
            : []
        return {
            groupId: group.id,
            threadId: group.threadId,
            title: group.title,
            revision: group.revision,
            members: (await publicMembers(this.db, group, members)).map(({ id, name, kind, active }) => ({
                id,
                name,
                kind,
                active
            })),
            messages: projected.map(({ message, communication, parentId }): GroupMapMessage => {
                const parent = parents.find((parent) => parent.id === parentId && parent.sequence < message.sequence)
                const blocks = groupDisplayContent(message.content)
                const resourceTitles = communication.resourceLinks?.map((link) => link.title) ?? []
                return {
                    id: message.id,
                    sequence: message.sequence,
                    senderId: communication.senderId,
                    recipientIds: communication.recipientIds,
                    intent: communication.intent,
                    replyStage: communication.intent === 'reply' ? (communication.replyStage ?? 'final') : undefined,
                    parentId: parent?.id ?? null,
                    relation: !parent
                        ? null
                        : communication.replyToMessageId
                          ? 'reply'
                          : communication.causedByMessageId
                            ? 'caused-by'
                            : 'root',
                    preview: ((chatMessageText(message.content) ?? '') || resourceTitles.join(' · ')).slice(0, 1200),
                    contentKinds: [
                        ...(resourceTitles.length || blocks.some((block) => block.type === 'resource_card')
                            ? ['resource' as const]
                            : []),
                        ...(blocks.some((block) => block.type === 'component') ? ['result' as const] : [])
                    ],
                    createdAt: message.createdAt.toISOString()
                }
            }),
            nextBefore: rows.length > query.limit ? page[0].sequence : null
        }
    }
}
