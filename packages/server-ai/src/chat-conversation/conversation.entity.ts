import {
	IChatConversation,
	IChatMessage,
	IStorageFile,
	IXpert,
	IXpertProject,
	IXpertTask,
	TChatConversationOptions,
	TChatConversationStatus,
	TChatFrom,
	TSensitiveOperation
} from '@metad/contracts'
import { StorageFile, TenantOrganizationBaseEntity } from '@metad/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsJSON, IsObject, IsOptional, IsString } from 'class-validator'
import { Column, Entity, Index, JoinColumn, JoinTable, ManyToMany, ManyToOne, OneToMany, RelationId } from 'typeorm'
import { ChatMessage, Xpert, XpertProject, XpertTask } from '../core/entities/internal'

@Entity('chat_conversation')
@Index(['tenantId', 'organizationId', 'id'])
export class ChatConversation extends TenantOrganizationBaseEntity implements IChatConversation {
	@ApiProperty({ type: () => String })
	@IsString()
	@Column({ nullable: true, default: () => 'gen_random_uuid()' })
	threadId: string

	@ApiPropertyOptional({ type: () => Object })
	@IsObject()
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

	@ApiProperty({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	error?: string

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	operation?: TSensitiveOperation

	@ApiProperty({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	from: TChatFrom

	@ApiProperty({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	fromEndUserId?: string

	/*
    |--------------------------------------------------------------------------
    | @ManyToMany 
    |--------------------------------------------------------------------------
    */
    // Attachments files
	@ManyToMany(() => StorageFile, {cascade: true})
	@JoinTable({
		name: 'chat_conversation_attachment'
	})
	attachments?: IStorageFile[]

	/*
    |--------------------------------------------------------------------------
    | @OneToMany
    |--------------------------------------------------------------------------
    */
	@ApiPropertyOptional({ type: () => ChatMessage, isArray: true })
	@IsOptional()
	@OneToMany(() => ChatMessage, (m) => m.conversation, {
		cascade: ['insert', 'update', 'remove', 'soft-remove', 'recover']
	})
	messages?: IChatMessage[] | null

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

	@ApiProperty({ type: () => XpertProject })
	@ManyToOne(() => XpertProject, {
		onDelete: 'CASCADE'
	})
	@JoinColumn()
	project?: IXpertProject

	@ApiProperty({ type: () => String })
	@RelationId((it: ChatConversation) => it.project)
	@IsString()
	@Column({ nullable: true })
	projectId?: string

	@ApiProperty({ type: () => XpertTask })
	@ManyToOne(() => XpertTask, {
		onDelete: "SET NULL"
	})
	@JoinColumn()
	task?: IXpertTask

	@ApiProperty({ type: () => String })
	@RelationId((it: ChatConversation) => it.task)
	@IsString()
	@Column({ nullable: true })
	taskId?: string
}
