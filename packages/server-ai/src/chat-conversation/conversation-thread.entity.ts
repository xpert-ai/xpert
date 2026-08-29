import { TChatConversationStatus, TSensitiveOperation } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsJSON, IsObject, IsOptional, IsString } from 'class-validator'
import { Column, Entity, Index, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import type { ChatMessage } from '../chat-message/chat-message.entity'
import type { ChatConversation } from './conversation.entity'

@Entity('chat_conversation_thread')
@Index(['threadId'], { unique: true })
@Index(['conversationId', 'updatedAt'])
export class ChatConversationThread extends TenantOrganizationBaseEntity {
    @ApiProperty({ type: () => String })
    @IsString()
    @Column({ type: 'varchar', length: 100 })
    threadId: string

    @ApiProperty({ type: () => Object })
    @ManyToOne('ChatConversation', { onDelete: 'CASCADE' })
    @JoinColumn()
    conversation?: ChatConversation

    @ApiProperty({ type: () => String })
    @RelationId((thread: ChatConversationThread) => thread.conversation)
    @IsString()
    @Column({ type: 'uuid' })
    conversationId: string

    @ApiPropertyOptional({ type: () => String })
    @IsString()
    @IsOptional()
    @Column({ type: 'varchar', length: 100, nullable: true })
    parentThreadId?: string | null

    @ApiPropertyOptional({ type: () => Object })
    @ManyToOne('ChatMessage', { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'headMessageId' })
    headMessage?: ChatMessage | null

    @ApiPropertyOptional({ type: () => String })
    @IsString()
    @IsOptional()
    @Column({ type: 'uuid', nullable: true })
    headMessageId?: string | null

    @ApiPropertyOptional({ type: () => String })
    @IsString()
    @IsOptional()
    @Column({ type: 'uuid', nullable: true })
    forkedFromMessageId?: string | null

    @ApiProperty({ type: () => String })
    @IsString()
    @Column({ type: 'varchar', default: 'idle' })
    status: TChatConversationStatus

    @ApiPropertyOptional({ type: () => String })
    @IsString()
    @IsOptional()
    @Column({ type: 'text', nullable: true })
    error?: string | null

    @ApiPropertyOptional({ type: () => Object })
    @IsJSON()
    @IsOptional()
    @Column({ type: 'jsonb', nullable: true })
    operation?: TSensitiveOperation | null

    @ApiPropertyOptional({ type: () => Object })
    @IsObject()
    @IsOptional()
    @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
    metadata: Record<string, unknown>
}
