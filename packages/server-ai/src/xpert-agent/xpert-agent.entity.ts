import { ICopilotModel, IKnowledgebase, IXpert, IXpertAgent, IXpertToolset, TAgentOutputVariable, TAgentPromptTemplate, TAvatar, TXpertAgentOptions, TXpertParameter } from '@metad/contracts'
import { TenantOrganizationBaseEntity } from '@metad/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsJSON, IsOptional, IsString } from 'class-validator'
import { Column, Entity, JoinColumn, ManyToOne, OneToOne, RelationId } from 'typeorm'
import { CopilotModel, Xpert } from '../core/entities/internal'

@Entity('xpert_agent')
export class XpertAgent extends TenantOrganizationBaseEntity implements IXpertAgent {
	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Column()
	key: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Column({ nullable: true, length: 100 })
	name?: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true, length: 100 })
	title?: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	description?: string

	@ApiPropertyOptional({ type: () => Object })
	@IsString()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	avatar?: TAvatar

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	prompt?: string

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	promptTemplates?: TAgentPromptTemplate[]
	
	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	parameters?: TXpertParameter[]

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	outputVariables?: TAgentOutputVariable[]

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	options?: TXpertAgentOptions

	/*
    |--------------------------------------------------------------------------
    | @OneToOne
    |--------------------------------------------------------------------------
    */
	@ApiProperty({ type: () => Xpert })
	@OneToOne(() => Xpert, {
		nullable: true,
		onDelete: 'CASCADE',
		onUpdate: 'CASCADE'
	})
	@JoinColumn()
	xpert: IXpert

	@ApiProperty({ type: () => String, readOnly: true })
	@RelationId((it: XpertAgent) => it.xpert)
	@IsString()
	@Column({ nullable: true })
	readonly xpertId: string

	// Copilot Model
	@ApiProperty({ type: () => CopilotModel })
	@OneToOne(() => CopilotModel, {
		nullable: true,
		cascade: ["insert", "update", "remove", "soft-remove", "recover"]
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
    | @ManyToOne
    |--------------------------------------------------------------------------
    */
	@ApiProperty({ type: () => Xpert })
	@ManyToOne(() => Xpert, {
		nullable: true,
		onDelete: 'CASCADE'
	})
	@JoinColumn()
	team?: IXpert

	@ApiProperty({ type: () => String })
	@RelationId((it: XpertAgent) => it.team)
	@IsString()
	@Column({ nullable: true })
	teamId?: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	leaderKey?: string

	leader?: IXpertAgent
	// @OneToMany
	followers?: IXpertAgent[]

	/*
    |--------------------------------------------------------------------------
    | @ManyToMany 
    |--------------------------------------------------------------------------
    */
	// Xpert role's knowledgebases
	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@Column({ type: 'json', nullable: true })
	knowledgebaseIds?: string[]
	knowledgebases?: IKnowledgebase[]

	// Toolsets
	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@Column({ type: 'json', nullable: true })
	toolsetIds?: string[]
	toolsets?: IXpertToolset[]

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@Column({ type: 'json', nullable: true })
	collaboratorNames?: string[]
	collaborators?: IXpert[]
}
