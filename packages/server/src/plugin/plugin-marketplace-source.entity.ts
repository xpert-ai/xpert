import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, IsUrl } from 'class-validator'
import { Column, Entity, Index } from 'typeorm'
import { TenantOrganizationBaseEntity } from '../core/entities/internal'

export const PLUGIN_MARKETPLACE_SOURCE_TYPES = ['url', 'github', 'git'] as const
export const PLUGIN_MARKETPLACE_SOURCE_STATUSES = ['idle', 'success', 'failed'] as const

export type PluginMarketplaceSourceType = (typeof PLUGIN_MARKETPLACE_SOURCE_TYPES)[number]
export type PluginMarketplaceSourceStatus = (typeof PLUGIN_MARKETPLACE_SOURCE_STATUSES)[number]

@Entity('plugin_marketplace_source')
@Index(['tenantId', 'organizationId', 'name'])
export class PluginMarketplaceSource extends TenantOrganizationBaseEntity {
	@ApiProperty({ type: () => String })
	@IsString()
	@Column()
	name: string

	@ApiProperty({ enum: PLUGIN_MARKETPLACE_SOURCE_TYPES })
	@IsIn(PLUGIN_MARKETPLACE_SOURCE_TYPES)
	@Column({ type: 'varchar' })
	type: PluginMarketplaceSourceType

	@ApiProperty({ type: () => String })
	@IsUrl({ require_tld: false, require_protocol: false })
	@Column()
	url: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	ref?: string | null

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	sparsePath?: string | null

	@ApiPropertyOptional({ type: () => Boolean })
	@IsBoolean()
	@IsOptional()
	@Column({ default: true })
	enabled?: boolean

	@ApiPropertyOptional({ type: () => Number })
	@IsNumber()
	@IsOptional()
	@Column({ default: 100 })
	priority?: number

	@ApiPropertyOptional({ enum: PLUGIN_MARKETPLACE_SOURCE_STATUSES })
	@IsIn(PLUGIN_MARKETPLACE_SOURCE_STATUSES)
	@IsOptional()
	@Column({ type: 'varchar', default: 'idle' })
	lastIndexStatus?: PluginMarketplaceSourceStatus

	@ApiPropertyOptional({ type: () => Date })
	@IsOptional()
	@Column({ type: 'timestamptz', nullable: true })
	lastIndexedAt?: Date | null

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	lastIndexError?: string | null

	@ApiPropertyOptional({ type: () => Object })
	@IsOptional()
	@Column({ type: 'jsonb', nullable: true })
	lastCatalog?: any
}
