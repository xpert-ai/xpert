import { ChatMessageFeedbackRatingEnum, IChatConversation, IChatMessage, IChatMessageFeedback, TSummaryJob } from '@metad/contracts'
import { TenantOrganizationBaseEntity } from '@metad/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString, IsJSON } from 'class-validator'
import { Column, Entity, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { ChatConversation, ChatMessage } from '../core/entities/internal'

@Entity('chat_message_feedback')
export class ChatMessageFeedback extends TenantOrganizationBaseEntity implements IChatMessageFeedback {
	@ApiProperty({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	rating: ChatMessageFeedbackRatingEnum

	@ApiProperty({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	content?: string

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	summaryJob: TSummaryJob

	/*
    |--------------------------------------------------------------------------
    | @ManyToOne 
    |--------------------------------------------------------------------------
    */
	@ApiProperty({ type: () => ChatConversation })
	@ManyToOne(() => ChatConversation, {
		onDelete: 'CASCADE'
	})
	@JoinColumn()
	conversation?: IChatConversation

	@ApiProperty({ type: () => String })
	@RelationId((it: ChatMessageFeedback) => it.conversation)
	@IsString()
	@Column({ nullable: true })
	conversationId?: string

	@ApiProperty({ type: () => ChatMessage })
	@ManyToOne(() => ChatMessage, {
		onDelete: 'CASCADE'
	})
	@JoinColumn()
	message?: IChatMessage

	@ApiProperty({ type: () => String })
	@RelationId((it: ChatMessageFeedback) => it.message)
	@IsString()
	@Column({ nullable: true })
	messageId?: string
}
