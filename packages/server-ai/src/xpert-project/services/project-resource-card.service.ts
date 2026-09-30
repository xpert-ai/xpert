// Invariants: bootstrap receipts and their first reply are claimed atomically.
// A crash before attachment leaves the receipt pending; replay cannot reassign it.
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import {
    createResourceCardContent,
    upsertResourceCardContent,
    type IChatConversation,
    type IChatMessage
} from '@xpert-ai/contracts'
import { XpertProject } from '../entities/project.entity'
import { ChatMessage } from '../../chat-message/chat-message.entity'

@Injectable()
export class ProjectResourceCardService {
    constructor(@InjectRepository(XpertProject) private readonly projects: Repository<XpertProject>) {}

    async attach(conversation: IChatConversation, reply: IChatMessage): Promise<IChatMessage> {
        if (!conversation.projectId || !reply.id || reply.conversationId !== conversation.id) return reply
        return this.projects.manager.transaction(async (manager) => {
            const projects = manager.getRepository(XpertProject)
            const project = await projects.findOne({
                where: {
                    id: conversation.projectId,
                    tenantId: conversation.tenantId,
                    organizationId: conversation.organizationId ?? IsNull()
                },
                lock: { mode: 'pessimistic_write' }
            })
            const bootstrap = project?.settings?.conversationBootstrap
            if (
                !bootstrap?.resourceCards?.length ||
                bootstrap.conversationId !== conversation.id ||
                bootstrap.resourceCardMessageId
            )
                return reply
            const messages = manager.getRepository(ChatMessage)
            const message = await messages.findOneOrFail({
                where: {
                    id: reply.id,
                    conversationId: conversation.id,
                    tenantId: conversation.tenantId,
                    organizationId: conversation.organizationId ?? IsNull(),
                    role: 'ai'
                },
                lock: { mode: 'pessimistic_write' }
            })
            let content = Array.isArray(message.content)
                ? message.content
                : message.content
                  ? [{ type: 'text' as const, text: message.content }]
                  : []
            for (const card of bootstrap.resourceCards) {
                content = upsertResourceCardContent(content, {
                    ...createResourceCardContent(card),
                    messageId: reply.id,
                    executionId: reply.executionId
                })
            }
            await messages.update(message.id, { content })
            await projects.update(project.id, {
                settings: {
                    ...project.settings,
                    conversationBootstrap: { ...bootstrap, resourceCardMessageId: message.id }
                }
            })
            return { ...reply, content }
        })
    }
}
