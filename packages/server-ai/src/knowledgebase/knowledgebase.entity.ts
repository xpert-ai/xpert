import {
	ICopilotModel,
	IIntegration,
	IKnowledgebase,
	IKnowledgeDocument,
	IXpert,
	KnowledgebaseParserConfig,
	KnowledgebasePermission,
	KnowledgebaseTypeEnum,
	KnowledgeStructureEnum,
	TAvatar,
	TKBRecallParams
} from '@metad/contracts'
import { Integration } from '@metad/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform, TransformFnParams } from 'class-transformer'
import { IsBoolean, IsEnum, IsJSON, IsNumber, IsOptional, IsString } from 'class-validator'
import { Column, Entity, Index, JoinColumn, ManyToMany, ManyToOne, OneToMany, OneToOne, RelationId } from 'typeorm'
import { WorkspaceBaseEntity } from '../core/entities/base.entity'
import { CopilotModel, KnowledgeDocument, Xpert } from '../core/entities/internal'
import { XpertIdentiDto } from '../xpert/dto'


@Entity('knowledgebase')
@Index(['tenantId', 'organizationId', 'name'], { unique: true })
export class Knowledgebase extends WorkspaceBaseEntity implements IKnowledgebase {
	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Column()
	name: string

	@ApiPropertyOptional({ enum: KnowledgebaseTypeEnum, enumName: 'KnowledgebaseTypeEnum' })
	@IsEnum(KnowledgebaseTypeEnum)
	@Column({ nullable: true, length: 20 })
	type: KnowledgebaseTypeEnum

	@ApiPropertyOptional({ enum: KnowledgeStructureEnum, enumName: 'KnowledgeStructureEnum' })
	@IsEnum(KnowledgeStructureEnum)
	@IsOptional()
	@Column({ nullable: true })
	structure?: KnowledgeStructureEnum

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true, length: 20 })
	language?: 'Chinese' | 'English'

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	avatar?: TAvatar

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	description?: string

	@ApiProperty({ type: () => String, enum: KnowledgebasePermission })
	@IsEnum(KnowledgebasePermission)
	@IsOptional()
	@Column({ nullable: true, default: KnowledgebasePermission.Private })
	permission?: KnowledgebasePermission

	// Copilot Model
	@ApiProperty({ type: () => CopilotModel })
	@OneToOne(() => CopilotModel, {
		nullable: true,
		cascade: true
	})
	@JoinColumn()
	copilotModel?: ICopilotModel

	@ApiProperty({ type: () => String })
	@RelationId((it: Knowledgebase) => it.copilotModel)
	@IsString()
	@Column({ nullable: true })
	copilotModelId?: string

	@ApiProperty({ type: () => CopilotModel })
	@OneToOne(() => CopilotModel, {
		nullable: true,
		cascade: true
	})
	@JoinColumn()
	rerankModel?: ICopilotModel

	@ApiProperty({ type: () => String })
	@RelationId((it: Knowledgebase) => it.rerankModel)
	@IsString()
	@Column({ nullable: true })
	rerankModelId?: string

	@ApiProperty({ type: () => CopilotModel })
	@OneToOne(() => CopilotModel, {
		nullable: true,
		cascade: true
	})
	@JoinColumn()
	visionModel?: ICopilotModel

	@ApiProperty({ type: () => String })
	@RelationId((it: Knowledgebase) => it.visionModel)
	@IsString()
	@Column({ nullable: true })
	visionModelId?: string

	@ApiPropertyOptional({ type: () => Number })
	@IsNumber()
	@IsOptional()
	@Column({ nullable: true })
	documentNum?: number

	@ApiPropertyOptional({ type: () => Number })
	@IsNumber()
	@IsOptional()
	@Column({ nullable: true })
	tokenNum?: number

	@ApiPropertyOptional({ type: () => Number })
	@IsNumber()
	@IsOptional()
	@Column({ nullable: true })
	chunkNum?: number

	/**
	 * @deprecated use `recall`
	 */
	@ApiPropertyOptional({ type: () => Number })
	@IsNumber()
	@IsOptional()
	@Column({ nullable: true, type: 'decimal' })
	similarityThreshold?: number

	@ApiPropertyOptional({ type: () => Number })
	@IsNumber()
	@IsOptional()
	@Column({ nullable: true })
	vectorSimilarityWeight?: number

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	recall?: TKBRecallParams

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	parserId?: string

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	parserConfig?: KnowledgebaseParserConfig

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	status?: string

	@ApiProperty({ type: () => Boolean })
	@IsBoolean()
	@IsOptional()
	@Column({ nullable: true, default: true })
	apiEnabled?: boolean

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	extKnowledgebaseId?: string

	/*
    |--------------------------------------------------------------------------
    | @OneToMany
    |--------------------------------------------------------------------------
    */
	@ApiPropertyOptional({ type: () => KnowledgeDocument, isArray: true })
	@IsOptional()
	@OneToMany(() => KnowledgeDocument, (kd) => kd.knowledgebase, {
		cascade: ['insert', 'update', 'remove', 'soft-remove', 'recover']
	})
	documents?: IKnowledgeDocument[] | null

	/*
    |--------------------------------------------------------------------------
    | @OneToOne
    |--------------------------------------------------------------------------
    */
	// One-to-One with Xpert
	@OneToOne(() => Xpert, (xpert) => xpert.knowledgebase, {
		cascade: true,
	})
	@JoinColumn({ name: 'pipelineId' })
	pipeline?: IXpert

	@IsOptional()
	@IsString()
	@Column({ nullable: true })
	pipelineId?: string

	/*
    |--------------------------------------------------------------------------
    | @ManyToOne
    |--------------------------------------------------------------------------
    */
	@ApiProperty({ type: () => Integration })
	@ManyToOne(() => Integration, {
		onDelete: 'SET NULL'
	})
	@JoinColumn()
	integration?: IIntegration

	@ApiProperty({ type: () => String })
	@RelationId((it: Knowledgebase) => it.integration)
	@IsString()
	@Column({ nullable: true })
	integrationId?: string

	/*
    |--------------------------------------------------------------------------
    | @ManyToMany 
    |--------------------------------------------------------------------------
    */
	@Transform((params: TransformFnParams) => params.value?.map((_) => new XpertIdentiDto(_)))
	@ManyToMany(() => Xpert, (xpert) => xpert.knowledgebases)
	xperts?: IXpert[]
}
