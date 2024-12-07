import { CopilotBaseMessage, IChatConversation, IXpert, IXpertAgentExecution, TChatConversationOptions, TChatConversationStatus } from '@metad/contracts'
import { TenantOrganizationBaseEntity } from '@metad/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsJSON, IsOptional, IsString } from 'class-validator'
import { Column, Entity, JoinColumn, ManyToOne, OneToOne, RelationId } from 'typeorm'
import { Xpert, XpertAgentExecution } from '../core/entities/internal'

@Entity('chat_conversation')
export class ChatConversation extends TenantOrganizationBaseEntity implements IChatConversation {
	@ApiProperty({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	key: string

	@ApiProperty({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	title?: string

	@ApiProperty({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	status?: TChatConversationStatus

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	options?: TChatConversationOptions

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	messages?: CopilotBaseMessage[] | null

	/*
    |--------------------------------------------------------------------------
    | @OneToOne 
    |--------------------------------------------------------------------------
    */
	@ApiProperty({ type: () => XpertAgentExecution })
	@OneToOne(() => XpertAgentExecution, {
		cascade: ["insert", "update", "remove", "soft-remove", "recover"]
	})
	@JoinColumn()
	execution?: IXpertAgentExecution

	@ApiProperty({ type: () => String })
	@RelationId((it: ChatConversation) => it.execution)
	@IsString()
	@Column({ nullable: true })
	readonly executionId?: string

	/*
    |--------------------------------------------------------------------------
    | @ManyToOne 
    |--------------------------------------------------------------------------
    */
	@ApiProperty({ type: () => Xpert })
	@ManyToOne(() => Xpert, {
		onDelete: 'CASCADE'
	})
	@JoinColumn()
	xpert?: IXpert

	@ApiProperty({ type: () => String })
	@RelationId((it: ChatConversation) => it.xpert)
	@IsString()
	@Column({ nullable: true })
	xpertId?: string
}
