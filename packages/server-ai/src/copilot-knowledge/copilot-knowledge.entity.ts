import { AiBusinessRole, AiProvider, ICopilotKnowledge } from '@metad/contracts'
import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsOptional, IsString } from 'class-validator'
import { Column, Entity } from 'typeorm'
import { TenantOrganizationBaseEntity } from '@metad/server-core'

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
	role?: AiBusinessRole | string

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
}
