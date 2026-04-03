import { ISkillRepository } from '@metad/contracts'
import { TenantOrganizationBaseEntity } from '@metad/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsDateString, IsJSON, IsOptional, IsString } from 'class-validator'
import { Column, DeleteDateColumn, Entity } from 'typeorm'

@Entity('skill_repository')
export class SkillRepository extends TenantOrganizationBaseEntity implements ISkillRepository {
	@ApiProperty({ type: () => String })
	@IsString()
	@Column({ length: 100 })
	name: string

	@ApiProperty({ type: () => String })
	@IsString()
	@Column({ length: 100 })
	provider: string

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'jsonb', nullable: true })
	credentials?: Record<string, any>

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'jsonb', nullable: true })
	options?: Record<string, any>

	@ApiPropertyOptional({ type: () => String, format: 'date-time' })
	@IsDateString()
	@IsOptional()
	@Column({ type: 'timestamptz', nullable: true })
	lastSyncAt?: Date

	// Soft Delete
	@ApiPropertyOptional({
		type: 'string',
		format: 'date-time',
		example: '2024-10-14T06:20:32.232Z'
	})
	@IsOptional()
	@IsDateString()
	// Soft delete column that records the date/time when the entity was soft-deleted
	@DeleteDateColumn() // Indicates that this column is used for soft-delete
	deletedAt?: Date
}
