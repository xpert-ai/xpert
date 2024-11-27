import { AiProvider, ICopilotKnowledge, IXpert } from '@metad/contracts'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsOptional, IsString } from 'class-validator'
import { Column, Entity, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { TenantOrganizationBaseEntity } from '@metad/server-core'
import { Xpert } from '../core/entities/internal'

@Entity('copilot_knowledge')
export class CopilotKnowledge extends TenantOrganizationBaseEntity implements ICopilotKnowledge {
	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true, length: 20 })
	provider?: AiProvider | string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true, length: 100 })
	role?: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true, length: 100 })
	command?: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Column({ length: 10000, nullable: true })
	input?: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Column({ length: 10000, nullable: true })
	output?: string

	@ApiPropertyOptional({ type: () => Boolean })
	@IsBoolean()
	@IsOptional()
	@Column({ default: false })
	vector?: boolean

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
	xpert?: IXpert

	@ApiProperty({ type: () => String })
	@RelationId((it: CopilotKnowledge) => it.xpert)
	@IsString()
	@Column({ nullable: true })
	xpertId?: string
}
