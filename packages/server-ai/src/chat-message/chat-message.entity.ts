import { ChatMessageStatusEnum, CopilotMessageType, IChatConversation, IChatMessage, IStorageFile, IXpertAgentExecution, TChatMessageStep, TMessageContent, TMessageContentReasoning, TSummaryJob, XpertAgentExecutionStatusEnum } from '@metad/contracts'
import { StorageFile, TenantOrganizationBaseEntity } from '@metad/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsJSON, IsOptional, IsString } from 'class-validator'
import { Column, Entity, JoinColumn, JoinTable, ManyToMany, ManyToOne, RelationId } from 'typeorm'
import { ChatConversation, XpertAgentExecution } from '../core/entities/internal'

@Entity('chat_message')
export class ChatMessage extends TenantOrganizationBaseEntity implements IChatMessage {

	@ApiProperty({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	role: CopilotMessageType

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	content: string | TMessageContent

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	reasoning?: TMessageContentReasoning[]

	@ApiProperty({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	status: ChatMessageStatusEnum

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	error: string

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	summaryJob: TSummaryJob

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	thirdPartyMessage?: any

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	events?: TChatMessageStep[]

	/*
    |--------------------------------------------------------------------------
    | @ManyToMany 
    |--------------------------------------------------------------------------
    */
    // Attachments files
	@ManyToMany(() => StorageFile, {cascade: true})
	@JoinTable({
		name: 'chat_message_attachment'
	})
	attachments?: IStorageFile[]

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
	@RelationId((it: ChatMessage) => it.conversation)
	@IsString()
	@Column({ nullable: true })
	conversationId?: string

	@ApiProperty({ type: () => XpertAgentExecution })
	@ManyToOne(() => XpertAgentExecution, {
		onDelete: 'CASCADE'
	})
	@JoinColumn()
	execution?: IXpertAgentExecution

	@ApiProperty({ type: () => String })
	@RelationId((it: ChatMessage) => it.execution)
	@IsString()
	@Column({ nullable: true })
	executionId?: string
}
