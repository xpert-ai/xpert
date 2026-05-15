import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ChatConversation, ChatMessage } from '../../core/entities/internal'
import { FileMemoryConversationHistoryReader, FileMemorySessionSnippet } from '../ports'

@Injectable()
export class XpertConversationHistoryReader implements FileMemoryConversationHistoryReader {
    constructor(
        @InjectRepository(ChatConversation)
        private readonly conversationRepository: Repository<ChatConversation>,
        @InjectRepository(ChatMessage)
        private readonly messageRepository: Repository<ChatMessage>
    ) {}

    async readSnippets(input: Parameters<FileMemoryConversationHistoryReader['readSnippets']>[0]) {
        if (!input.conversationIds.length) {
            return []
        }

        const conversations = await this.conversationRepository.find({
            where: input.conversationIds.map((id) => ({
                id,
                xpertId: input.xpert.id,
                tenantId: input.xpert.tenantId
            })),
            select: ['id', 'threadId', 'title', 'xpertId', 'tenantId']
        })
        const allowedConversationIds = new Set(conversations.map((conversation) => conversation.id))
        if (!allowedConversationIds.size) {
            return []
        }

        const messages = await this.messageRepository
            .createQueryBuilder('message')
            .where('message.conversationId IN (:...conversationIds)', {
                conversationIds: Array.from(allowedConversationIds)
            })
            .andWhere('message.tenantId = :tenantId', {
                tenantId: input.xpert.tenantId
            })
            .orderBy('message.createdAt', 'DESC')
            .take(input.maxMessages)
            .getMany()

        let totalBytes = 0
        return messages
            .reverse()
            .map<FileMemorySessionSnippet>((message) => ({
                conversationId: message.conversationId,
                executionId: message.executionId,
                messageId: message.id,
                role: message.role,
                createdAt: message.createdAt,
                content: truncateText(stringifyMessageContent(message.content), 2_000)
            }))
            .filter((snippet) => {
                const bytes = Buffer.byteLength(JSON.stringify(snippet), 'utf8')
                if (totalBytes + bytes > input.maxBytes) {
                    return false
                }
                totalBytes += bytes
                return true
            })
    }
}

function stringifyMessageContent(content: unknown): string {
    if (typeof content === 'string') {
        return content
    }
    if (Array.isArray(content)) {
        return content
            .map((item) => {
                if (typeof item === 'string') {
                    return item
                }
                if (item && typeof item === 'object' && 'text' in item) {
                    return String((item as { text?: unknown }).text ?? '')
                }
                return ''
            })
            .filter(Boolean)
            .join('\n')
    }
    if (content && typeof content === 'object') {
        if ('text' in content) {
            return String((content as { text?: unknown }).text ?? '')
        }
        return JSON.stringify(content)
    }
    return ''
}

function truncateText(value: string, maxLength: number) {
    return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value
}
