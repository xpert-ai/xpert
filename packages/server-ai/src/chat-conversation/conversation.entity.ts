import {
	IChatConversation,
	IChatMessage,
	IProjectCore,
	IStorageFile,
	IXpert,
	IXpertTask,
	TChatConversationOptions,
	TChatConversationStatus,
	TChatFrom,
	TSensitiveOperation
} from '@xpert-ai/contracts'
import { StorageFile, TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsJSON, IsObject, IsOptional, IsString } from 'class-validator'
import { Column, Entity, Index, JoinColumn, JoinTable, ManyToMany, ManyToOne, OneToMany, RelationId } from 'typeorm'
import { ChatMessage, ProjectCore, Xpert, XpertTask } from '../core/entities/internal'

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
	@Column({ type: 'varchar', nullable: true })
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
	@Column({ type: 'varchar', nullable: true })
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

	@ApiProperty({ type: () => ProjectCore })
	// Keep project scope soft-bound so conversations can survive legacy rows and
	// project lifecycle changes while still resolving the current project-core record.
	@ManyToOne(() => ProjectCore, {
		nullable: true,
		createForeignKeyConstraints: false
	})
	@JoinColumn({ name: 'projectId' })
	project?: IProjectCore

	@ApiProperty({ type: () => String })
	@RelationId((it: ChatConversation) => it.project)
	@IsString()
	@Column({ type: 'uuid', nullable: true })
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
