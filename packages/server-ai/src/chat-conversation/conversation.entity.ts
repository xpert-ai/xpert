import {
	CopilotBaseMessage,
	IChatConversation,
	IXpert,
	TChatConversationOptions,
	TChatConversationStatus
} from '@metad/contracts'
import { TenantOrganizationBaseEntity } from '@metad/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsJSON, IsOptional, IsString } from 'class-validator'
import { Column, Entity, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { Xpert } from '../core/entities/internal'

@Entity('chat_conversation')
export class ChatConversation extends TenantOrganizationBaseEntity implements IChatConversation {
	@ApiProperty({ type: () => String })
	@IsString()
	@Column({ nullable: true, default: () => 'uuid_generate_v4()' })
	threadId: string

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
