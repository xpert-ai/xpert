import { ApiProperty } from '@nestjs/swagger'
import { ISemanticModel, ISemanticModelCache } from '@metad/contracts'
import { TenantBaseEntity } from '@metad/server-core'
import { IsString } from 'class-validator'
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm'
import { SemanticModel } from '../model.entity'

/**
 * Semantic model data caching
 */
@Entity('semantic_model_cache')
export class SemanticModelCache extends TenantBaseEntity implements ISemanticModelCache {

    @IsString()
	@Column({ length: 40 })
    key: string

	@IsString()
	@Column({ length: 40, nullable: true })
    language: string

	/**
	 * Model
	 */
	@ApiProperty({ type: () => SemanticModel })
	@ManyToOne(() => SemanticModel, (d) => d.cache, {
		nullable: true,
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	model?: ISemanticModel

	@ApiProperty({ type: () => String })
	@IsString()
	@Column({ nullable: true })
	modelId?: string

	@IsString()
	@Column({ nullable: true })
    query?: string

    @IsString()
	@Column({ nullable: true })
    data?: string
}
