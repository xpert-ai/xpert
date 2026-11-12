import { Injectable } from '@nestjs/common'
import type { DynamicStructuredTool, StructuredToolInterface } from '@langchain/core/tools'
import { CommandBus } from '@nestjs/cqrs'
import { DataSource } from 'typeorm'
import { randomUUID } from 'node:crypto'
import { ChatConversationThread } from '../chat-conversation/conversation-thread.entity'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { GroupParticipant, GroupMessageRecipient } from './group.entity'
import { GroupAccessService } from './group-access.service'
import { GroupMessagesService } from './group-messages.service'
import { groupDenied } from './group.errors'
import { parseGroupCommunication } from './group.schema'
import { GroupResourceNavigationCommand } from '../artifacts/group-references/commands/group-resource-navigation.command'
import { createResourceNavigationTools } from '../shared/agent/resource-navigation/tools'
import { createResourceAnalysisTools } from '../shared/agent/resource-navigation/analysis-tools'
import { GroupResourceAnalysisCommand } from '../artifacts/analysis/commands/group-resource-analysis.command'
import { DiscoverConversationResourcesCommand } from '../content-resource/commands/discover-conversation-resources.command'
import { ResolveProjectResourceNavigationCommand } from '../content-resource/commands/resolve-project-resource-navigation.command'
import type { ChatGroupResourceLink } from '@xpert-ai/contracts'

/** Only a human-addressed run can request UI navigation. Handoffs/background jobs cannot open another user's UI. */
@Injectable()
export class GroupResourceToolsService {
    constructor(
        private readonly db: DataSource,
        private readonly access: GroupAccessService,
        private readonly messages: GroupMessagesService,
        private readonly commands: CommandBus
    ) {}

    private async authorize(receipt: GroupMessageRecipient, member: GroupParticipant) {
        const scope = { tenantId: receipt.tenantId, organizationId: receipt.organizationId }
        const [thread, current, group, source] = await Promise.all([
            this.db.getRepository(ChatConversationThread).findOneBy({
                ...scope,
                threadId: member.runtimeThreadId,
                conversationId: member.runtimeConversationId
            }),
            this.db
                .getRepository(GroupParticipant)
                .findOneBy({ ...scope, id: member.id, groupId: receipt.groupId, active: true }),
            this.db.getRepository(ChatConversation).findOneBy({ ...scope, id: receipt.groupId, purpose: 'group' }),
            this.db
                .getRepository(ChatMessage)
                .findOneBy({ ...scope, id: receipt.messageId, conversationId: receipt.groupId })
        ])
        if (
            !group?.projectId ||
            !current ||
            !source ||
            source.role !== 'human' ||
            !source.createdById ||
            thread?.status !== 'busy' ||
            thread.runControl?.executionId !== receipt.executionId
        )
            throw groupDenied()
        const actor = { ...scope, userId: source.createdById }
        const communication = parseGroupCommunication(source.groupCommunication)
        if (!communication.recipientIds.includes(member.id) || communication.projectTask || communication.runtimeResult)
            throw groupDenied()
        await this.access.withRootUser(group, actor.userId, () => this.access.assistant(member.subjectId))
        return { actor, group, current, source, communication }
    }

    createNavigationTools(receipt: GroupMessageRecipient, member: GroupParticipant): DynamicStructuredTool[] {
        return createResourceNavigationTools({
            search: async (query) => {
                const { actor, group } = await this.authorize(receipt, member)
                const page = await this.commands.execute(
                    new DiscoverConversationResourcesCommand(
                        {
                            actor,
                            projectId: group.projectId,
                            assistantId: member.subjectId,
                            conversationId: member.runtimeConversationId
                        },
                        query
                    )
                )
                await this.authorize(receipt, member)
                return {
                    nextCursor: page.nextCursor,
                    hasMore: page.nextCursor !== null,
                    items: page.items.map((item) => ({ ...item, id: item.resource.id }))
                }
            },
            present: async (items, autoOpen, config) => {
                const toolCall = config && 'toolCall' in config ? config.toolCall : undefined
                if (
                    !toolCall ||
                    typeof toolCall !== 'object' ||
                    !('id' in toolCall) ||
                    typeof toolCall.id !== 'string' ||
                    !toolCall.id
                )
                    throw groupDenied()
                const { actor, group, current, source, communication } = await this.authorize(receipt, member)
                const links: ChatGroupResourceLink[] = []
                for (const item of items) {
                    if (item.resource.kind === 'group-reference') {
                        const page = await this.commands.execute(
                            new GroupResourceNavigationCommand(actor, group.id, { referenceIds: [item.id] })
                        )
                        links.push(...page.items)
                    } else {
                        const resolved = await this.commands.execute(
                            new ResolveProjectResourceNavigationCommand(
                                {
                                    actor,
                                    projectId: group.projectId,
                                    assistantId: member.subjectId,
                                    conversationId: member.runtimeConversationId
                                },
                                item.id
                            )
                        )
                        links.push({
                            resource: item.resource,
                            projectId: group.projectId,
                            title: resolved.title,
                            ...(resolved.icon ? { icon: resolved.icon } : {})
                        })
                    }
                }
                await this.authorize(receipt, member)
                const requestId = randomUUID()
                await this.access.withRootUser(group, actor.userId, () =>
                    this.messages.publish(
                        group,
                        current,
                        {
                            intent: 'message',
                            text: links.map((item) => item.title).join('\n'),
                            recipientIds: [],
                            clientMessageId: requestId
                        },
                        communication,
                        `tool:${receipt.executionId}:${toolCall.id}`,
                        false,
                        source.id,
                        {
                            resourceLinks: links,
                            ...(autoOpen
                                ? {
                                      resourceNavigation: {
                                          requestId,
                                          issuedAt: Date.now(),
                                          clientMessageId: source.messageEnvelope?.correlation?.messageId ?? source.id,
                                          participantId: communication.senderId
                                      }
                                  }
                                : {})
                        }
                    )
                )
            }
        })
    }

    /** Analysis remains governed separately by its dataset grant and delivery policy. */
    createAnalysisTools(receipt: GroupMessageRecipient, member: GroupParticipant): StructuredToolInterface[] {
        const analysis = async (operation: GroupResourceAnalysisCommand['operation']) => {
            const { actor, group } = await this.authorize(receipt, member)
            const result = await this.access.withRootUser(group, actor.userId, () =>
                this.commands.execute(
                    new GroupResourceAnalysisCommand(actor, group.id, member.subjectId, receipt.executionId, operation)
                )
            )
            await this.authorize(receipt, member)
            return result
        }
        return createResourceAnalysisTools({
            describe: (referenceId) => analysis({ kind: 'describe', referenceId }),
            query: (referenceId, query) => analysis({ kind: 'query', referenceId, query })
        })
    }

    async validateAnalysisDelivery(
        receipt: GroupMessageRecipient,
        member: GroupParticipant,
        group: ChatConversation,
        userId: string
    ) {
        const actor = { tenantId: group.tenantId, organizationId: group.organizationId, userId }
        await this.access.withRootUser(group, userId, () =>
            this.commands.execute(
                new GroupResourceAnalysisCommand(actor, group.id, member.subjectId, receipt.executionId, {
                    kind: 'validate-delivery'
                })
            )
        )
    }
}
