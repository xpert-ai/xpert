import { ISemanticModel, IModelQuery } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsJSON, IsOptional, IsString, IsNumber } from 'class-validator'
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm'
import { SemanticModel } from '../core/entities/internal'

/**
 * 单个查询
 */
@Entity('model_query')
export class ModelQuery extends TenantOrganizationBaseEntity implements IModelQuery {
	@ApiProperty({ type: () => String })
	@IsString()
	@Column({ length: 10 })
	key: string

	@ApiProperty({ type: () => String })
	@IsString()
	@Column({ length: 100 })
	name: string

	@ApiPropertyOptional({ type: () => Number })
	@IsNumber()
	@IsOptional()
	@Column({ nullable: true })
	index?: number

	/**
	 * Model
	 */
	@ApiProperty({ type: () => SemanticModel })
	@ManyToOne(() => SemanticModel, (d) => d.cache, {
		nullable: true,
		onDelete: 'CASCADE'
	})
	@JoinColumn()
	model?: ISemanticModel

	@ApiProperty({ type: () => String })
	// @RelationId((it: SemanticModelCache) => it.model)
	@IsString()
	@Column({ nullable: true })
	modelId: string

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	options: any
}
