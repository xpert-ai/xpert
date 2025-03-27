import { ISemanticModel, ISemanticModelQueryLog, QueryStatusEnum, TQueryOptions } from '@metad/contracts'
import { TenantOrganizationBaseEntity } from '@metad/server-core'
import { ApiProperty } from '@nestjs/swagger'
import { IsJSON, IsOptional, IsString } from 'class-validator'
import { Column, Entity, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { SemanticModel } from '../core/entities/internal'

/**
 * Query log for semantic model
 */
@Entity('model_query_log')
export class SemanticModelQueryLog extends TenantOrganizationBaseEntity implements ISemanticModelQueryLog {
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
	@RelationId((it: SemanticModelQueryLog) => it.model)
	@IsString()
	@Column({ nullable: true })
	modelId: string

	@ApiProperty({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	cube?: string

	@Column({ type: 'float', nullable: true })
	executionTime: number
	@Column({ type: 'float', nullable: true })
	waitingTime: number

	@ApiProperty({ type: () => String, enum: QueryStatusEnum })
	@Column({ type: 'enum', enum: QueryStatusEnum, default: QueryStatusEnum.PENDING })
	status: QueryStatusEnum // 查询状态

	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	params: TQueryOptions

	@ApiProperty({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	query?: string

	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	result: any

	@ApiProperty({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	error?: string
}
