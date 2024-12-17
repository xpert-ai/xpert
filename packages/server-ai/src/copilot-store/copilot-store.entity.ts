import { ICopilotStore } from '@metad/contracts'
import { TenantOrganizationBaseEntity } from '@metad/server-core'
import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsJSON, IsOptional, IsString } from 'class-validator'
import { Column, Entity, Index } from 'typeorm'

@Entity('copilot_store')
@Index('key_in_org', ['organizationId', 'prefix', 'key'], { unique: true })
@Index('key_in_namespace', ['prefix', 'key'], { unique: true })
export class CopilotStore extends TenantOrganizationBaseEntity implements ICopilotStore {
	@ApiPropertyOptional({ type: String })
	@IsString()
	@IsOptional()
	@Column()
	prefix: string

	@ApiPropertyOptional({ type: String })
	@IsString()
	@IsOptional()
	@Column()
	key: string

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'jsonb' })
	value: any
}
