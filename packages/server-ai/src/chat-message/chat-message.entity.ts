import { MessageContent } from '@langchain/core/messages'
import { CopilotMessageType, IChatConversation, IChatMessage, IXpertAgentExecution, TSummaryJob, XpertAgentExecutionStatusEnum } from '@metad/contracts'
import { TenantOrganizationBaseEntity } from '@metad/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsJSON, IsOptional, IsString } from 'class-validator'
import { Column, Entity, JoinColumn, ManyToOne, RelationId } from 'typeorm'
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
	content: string | MessageContent

	@ApiProperty({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	status: XpertAgentExecutionStatusEnum | 'thinking' | 'aborted'

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