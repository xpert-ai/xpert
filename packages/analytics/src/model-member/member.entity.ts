import { ISemanticModel, ISemanticModelEntity, ISemanticModelMember } from '@metad/contracts'
import { TenantOrganizationBaseEntity } from '@metad/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsOptional, IsString, IsNumber } from 'class-validator'
import { Column, Entity, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { SemanticModel, SemanticModelEntity } from '../core/entities/internal'

/**
 * Dimension member table
 */
@Entity('model_member')
export class SemanticModelMember extends TenantOrganizationBaseEntity implements ISemanticModelMember {

	@IsString()
	@Column({ length: 40 })
	cube: string

	@IsString()
	@Column({ length: 100 })
	dimension: string

	@IsString()
	@Column({ length: 100, nullable: true })
	hierarchy: string

	@IsString()
	@Column({ length: 100, nullable: true })
	level: string

	@IsString()
	@Column({ length: 40, nullable: true })
	language: string

	@IsString()
	@Column({ length: 1000 })
	memberUniqueName: string

	/**
	 * Model
	 */
	@ApiProperty({ type: () => SemanticModel })
	@ManyToOne(() => SemanticModel, (d) => d.dimensionMembers, {
		nullable: true,
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	model?: ISemanticModel

	@ApiProperty({ type: () => String })
	@RelationId((it: SemanticModelMember) => it.model)
	@IsString()
	@Column({ nullable: true })
	modelId?: string

	/**
	 * Entity
	 */
	@ApiProperty({ type: () => SemanticModelEntity })
	@ManyToOne(() => SemanticModelEntity, (d) => d.dimensionMembers, {
		nullable: true,
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	entity?: ISemanticModelEntity
	
	@ApiProperty({ type: () => String })
	@RelationId((it: SemanticModelMember) => it.entity)
	@IsString()
	@Column({ nullable: true })
	entityId?: string

	@IsString()
	@Column({ length: 1000 })
	memberName: string

	@IsString()
	@Column({ length: 1000 })
	memberKey: string

	@IsString()
	@Column({ length: 1000, nullable: true })
	memberCaption: string

	@IsNumber()
	@Column('integer', { nullable: true })
	memberOrdinal: number

	@IsNumber()
	@Column('int2', { nullable: true })
	memberType: number

	@IsNumber()
	@Column('int2', { nullable: true })
	levelNumber: number

	@IsString()
	@Column({ length: 1000, nullable: true })
	parentUniqueName: string

	// For vector store
	@ApiPropertyOptional({ type: () => Boolean })
	@IsBoolean()
	@IsOptional()
	@Column({ default: false })
	vector?: boolean
}
