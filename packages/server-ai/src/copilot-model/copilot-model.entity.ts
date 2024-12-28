import { ICopilot, ICopilotModel, AiModelTypeEnum, TCopilotModelOptions } from '@metad/contracts'
import { TenantOrganizationBaseEntity } from '@metad/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsJSON, IsOptional, IsString } from 'class-validator'
import { Column, Entity, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { Copilot } from '../core/entities/internal'


@Entity('copilot_model')
export class CopilotModel extends TenantOrganizationBaseEntity implements ICopilotModel {

	@ApiPropertyOptional({ enum: AiModelTypeEnum })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	modelType?: AiModelTypeEnum

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	model?: string

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	options?: TCopilotModelOptions

	/*
    |--------------------------------------------------------------------------
    | @ManyToOne 
    |--------------------------------------------------------------------------
    */
	@ApiProperty({ type: () => Copilot })
	@IsOptional()
	@ManyToOne(() => Copilot, { onDelete: 'SET NULL' })
	@JoinColumn()
	copilot?: ICopilot

	@ApiProperty({ type: () => String })
	@RelationId((it: CopilotModel) => it.copilot)
	@IsString()
	@Column({ nullable: true })
	copilotId?: string

	@ApiProperty({ type: () => CopilotModel })
	@IsOptional()
	@ManyToOne(() => CopilotModel)
	@JoinColumn({ name: 'referencedId' })
	referencedModel?: ICopilotModel

	@ApiProperty({ type: () => String })
	@RelationId((it: CopilotModel) => it.referencedModel)
	@IsString()
	@Column({ nullable: true })
	referencedId?: string

}
