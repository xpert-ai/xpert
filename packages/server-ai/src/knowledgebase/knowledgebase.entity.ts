import { ICopilotModel, IKnowledgebase, IKnowledgeDocument, KnowledgebaseParserConfig, KnowledgebasePermission, KnowledgebaseTypeEnum, TAvatar } from '@metad/contracts'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsJSON, IsNumber, IsOptional, IsString, IsEnum } from 'class-validator'
import { Column, Entity, Index, JoinColumn, OneToMany, OneToOne, RelationId } from 'typeorm'
import { CopilotModel, KnowledgeDocument } from '../core/entities/internal'
import { WorkspaceBaseEntity } from '../core/entities/base.entity'

@Entity('knowledgebase')
@Index(['tenantId', 'organizationId', 'name'], { unique: true })
export class Knowledgebase extends WorkspaceBaseEntity implements IKnowledgebase {
	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Column()
	name: string

	@ApiPropertyOptional({ enum: KnowledgebaseTypeEnum, enumName: 'KnowledgebaseTypeEnum' })
	@IsString()
	@Column({ nullable: true, length: 20 })
	type: KnowledgebaseTypeEnum

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
}
