import {
	AiBusinessRole,
	ICopilotModel,
	IIntegration,
	IKnowledgebase,
	ITag,
	IUser,
	IXpert,
	IXpertAgent,
	IXpertToolset,
	TAvatar,
	TChatApi,
	TChatApp,
	TLongTermMemory,
	TSummarize,
	TXpertAgentConfig,
	TXpertGraph,
	TXpertOptions,
	TXpertTeamDraft,
	XpertTypeEnum
} from '@metad/contracts'
import { Integration, Tag, User } from '@metad/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsJSON, IsOptional, IsString } from 'class-validator'
import { Column, Entity, Index, JoinColumn, JoinTable, ManyToMany, ManyToOne, OneToMany, OneToOne, RelationId } from 'typeorm'
import { WorkspaceBaseEntity } from '../core/entities/base.entity'
import { CopilotModel, Knowledgebase, XpertAgent, XpertToolset } from '../core/entities/internal'


@Entity('xpert')
@Index(['tenantId', 'organizationId', 'type', 'slug', 'version', 'latest'], { unique: true })
export class Xpert extends WorkspaceBaseEntity implements IXpert {
	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Column({ length: 100 })
	slug: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Column({ length: 100 })
	name: AiBusinessRole | string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Column({ length: 10 })
	type: XpertTypeEnum

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true, length: 100 })
	title?: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true, length: 100 })
	titleCN?: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true, length: 500 })
	description?: string

	@ApiPropertyOptional({ type: () => Boolean })
	@IsBoolean()
	@IsOptional()
	@Column({ nullable: true })
	active?: boolean

	@ApiPropertyOptional({ type: () => Object })
	@IsString()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	avatar?: TAvatar

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	starters?: string[]

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	options?: TXpertOptions

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	agentConfig?: TXpertAgentConfig

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	summarize?: TSummarize

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	memory?: TLongTermMemory

	// Versions
	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true, length: 20 })
	version?: string

	@ApiPropertyOptional({ type: () => Boolean })
	@IsBoolean()
	@IsOptional()
	@Column({ nullable: true })
	latest?: boolean

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	draft?: TXpertTeamDraft

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	graph?: TXpertGraph

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	api?: TChatApi

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	app?: TChatApp

	@Column({ nullable: true })
	userId?: string

	@ManyToOne(() => User, { nullable: true })
	@JoinColumn()
	user?: User

	/*
    |--------------------------------------------------------------------------
    | @OneToOne
    |--------------------------------------------------------------------------
    */
	@ApiProperty({ type: () => XpertAgent })
	@OneToOne(() => XpertAgent, (agent: XpertAgent) => agent.xpert, {
		cascade: true
	})
	agent?: IXpertAgent

	// Copilot Model
	@ApiProperty({ type: () => CopilotModel })
	@OneToOne(() => CopilotModel, {
		nullable: true,
		cascade: ['insert', 'update', 'remove', 'soft-remove', 'recover']
	})
	@JoinColumn()
	copilotModel?: ICopilotModel

	@ApiProperty({ type: () => String })
	@RelationId((it: Xpert) => it.copilotModel)
	@IsString()
	@Column({ nullable: true })
	copilotModelId?: string

	/*
    |--------------------------------------------------------------------------
    | @OneToMany 
    |--------------------------------------------------------------------------
    */
	// AI Agents
	@ApiProperty({ type: () => XpertAgent, isArray: true })
	@OneToMany(() => XpertAgent, (agent) => agent.team)
	agents?: IXpertAgent[]

	/*
    |--------------------------------------------------------------------------
    | @ManyToMany 
    |--------------------------------------------------------------------------
    */
	// Executors
	@ManyToMany(() => Xpert, (x) => x.leaders, {
		onUpdate: 'CASCADE',
		onDelete: 'CASCADE'
	})
	@JoinTable({
		name: 'xpert_to_executor',
		joinColumn: {
			name: 'leaderId',
			referencedColumnName: 'id'
		},
		inverseJoinColumn: {
			name: 'executorId',
			referencedColumnName: 'id'
		}
	})
	executors?: IXpert[]

	// Leaders
	@ManyToMany(() => Xpert, (x) => x.executors, {
		cascade: true
	})
	leaders?: IXpert[]

	// Xpert role's knowledgebases
	@ManyToMany(() => Knowledgebase, {
		onUpdate: 'CASCADE',
		onDelete: 'CASCADE'
	})
	@JoinTable({
		name: 'xpert_to_knowledgebase'
	})
	knowledgebases?: IKnowledgebase[]

	// Toolsets
	@ManyToMany(() => XpertToolset, {
		onUpdate: 'CASCADE',
		onDelete: 'CASCADE'
	})
	@JoinTable({
		name: 'xpert_to_toolset'
	})
	toolsets?: IXpertToolset[]

	@ManyToMany(() => User, {
		onUpdate: 'CASCADE'
	})
	@JoinTable({
		name: 'xpert_to_manager'
	})
	managers?: IUser[]

	// Xpert Tags
	@ManyToMany(() => Tag, { cascade: true, eager: true })
	@JoinTable({
		name: 'tag_xpert'
	})
	tags?: ITag[]

	@ApiProperty({ type: () => Integration, isArray: true })
	@ManyToMany(() => Integration, {
		onUpdate: 'CASCADE',
		onDelete: 'CASCADE'
	})
	@JoinTable({
		name: 'xpert_to_integration',
	})
	integrations?: IIntegration[]
}
