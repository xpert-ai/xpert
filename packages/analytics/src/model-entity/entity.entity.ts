import {
	ISemanticModel,
	ISemanticModelEntity,
	ISemanticModelMember,
	ModelEntityType,
	SemanticModelEntityOptions,
	SemanticModelEntityJob,
	TScheduleOptions,
	ScheduleTaskStatus
} from '@metad/contracts'
import { TenantOrganizationBaseEntity } from '@metad/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsEnum, IsJSON, IsObject, IsOptional, IsString } from 'class-validator'
import { Column, Entity, JoinColumn, ManyToOne, OneToMany, RelationId } from 'typeorm'
import { SemanticModel, SemanticModelMember } from '../core/entities/internal'

/**
 * Entity in semantic model
 */
@Entity('semantic_model_entity')
export class SemanticModelEntity extends TenantOrganizationBaseEntity implements ISemanticModelEntity {

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	name?: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	caption?: string

	@ApiProperty({ type: () => String, enum: ModelEntityType })
	@IsEnum(ModelEntityType)
	@Column({ nullable: true })
	type: ModelEntityType

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	options?: SemanticModelEntityOptions

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	job?: SemanticModelEntityJob

	@ApiPropertyOptional({ type: () => Object })
	@IsObject()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	schedule?: TScheduleOptions

	@ApiPropertyOptional({ type: () => String })
	@IsOptional()
	@IsString()
	@Column({ nullable: true })
	timeZone?: string

	@ApiPropertyOptional({ enum: ScheduleTaskStatus })
	@IsEnum(ScheduleTaskStatus)
	@IsOptional()
	@Column({ nullable: true, length: 20 })
	status?: ScheduleTaskStatus

	/**
	 * Model
	 */
	@ApiProperty({ type: () => SemanticModel })
	@ManyToOne(() => SemanticModel, (d) => d.entities, {
		nullable: true,
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	model?: ISemanticModel
	
	@ApiProperty({ type: () => String })
	@RelationId((it: SemanticModelEntity) => it.model)
	@IsString()
	@Column({ nullable: true })
	modelId?: string

	/**
	 * Dimension Members
	 */
	@OneToMany(() => SemanticModelMember, (m) => m.entity, {
		nullable: true,
		cascade: true,
	})
	dimensionMembers?: ISemanticModelMember[]
}
