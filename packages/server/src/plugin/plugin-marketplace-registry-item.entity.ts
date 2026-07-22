import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsString } from 'class-validator'
import type { I18nObject } from '@xpert-ai/contracts'
import { Column, Entity, Index } from 'typeorm'
import { TenantBaseEntity } from '../core/entities/internal'

export const PLUGIN_MARKETPLACE_REGISTRY_SECTIONS = ['marketplace', 'official', 'partner', 'community'] as const
export const PLUGIN_MARKETPLACE_REGISTRY_DOWNLOAD_STATUSES = ['idle', 'success', 'failed'] as const

export type PluginMarketplaceRegistrySection = (typeof PLUGIN_MARKETPLACE_REGISTRY_SECTIONS)[number]
export type PluginMarketplaceRegistryDownloadStatus = (typeof PLUGIN_MARKETPLACE_REGISTRY_DOWNLOAD_STATUSES)[number]

@Entity('plugin_marketplace_registry_item')
@Index(['tenantId', 'packageName'])
export class PluginMarketplaceRegistryItem extends TenantBaseEntity {
	@ApiProperty({ type: () => String })
	@IsString()
	@Column()
	packageName: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	version?: string | null

	/**
	 * Artifact namespace declared for marketplace display and manual review before install.
	 * Runtime install still validates explicit namespace ownership against loaded plugins.
	 */
	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	artifactNamespace?: string | null

	@ApiProperty({ type: () => String })
	@IsString()
	@Column()
	displayName: string

	@ApiPropertyOptional({ type: () => Object })
	@IsOptional()
	@Column({ type: 'jsonb', nullable: true })
	displayNameI18n?: I18nObject | null

	@ApiProperty({ type: () => String })
	@IsString()
	@Column()
	description: string

	@ApiPropertyOptional({ type: () => Object })
	@IsOptional()
	@Column({ type: 'jsonb', nullable: true })
	descriptionI18n?: I18nObject | null

	@ApiProperty({ type: () => String })
	@IsString()
	@Column()
	category: string

	@ApiProperty({ type: () => String })
	@IsString()
	@Column()
	author: string

	@ApiPropertyOptional({ type: () => Object })
	@IsOptional()
	@Column({ type: 'jsonb', nullable: true })
	icon?: any

	@ApiPropertyOptional({ type: () => [String] })
	@IsArray()
	@IsOptional()
	@Column({ type: 'jsonb', nullable: true })
	keywords?: string[] | null

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	homepage?: string | null

	@ApiPropertyOptional({ type: () => Object })
	@IsOptional()
	@Column({ type: 'jsonb', nullable: true })
	repository?: any

	@ApiProperty({ type: () => [String] })
	@IsArray()
	@Column({ type: 'jsonb' })
	targetApps: string[]

	@ApiPropertyOptional({ type: () => Object })
	@IsOptional()
	@Column({ type: 'jsonb', nullable: true })
	targetAppMeta?: any

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

	@ApiPropertyOptional({ enum: PLUGIN_MARKETPLACE_REGISTRY_SECTIONS })
	@IsIn(PLUGIN_MARKETPLACE_REGISTRY_SECTIONS)
	@IsOptional()
	@Column({ type: 'varchar', default: 'marketplace' })
	section?: PluginMarketplaceRegistrySection

	@ApiPropertyOptional({ type: () => Object })
	@IsOptional()
	@Column({ type: 'jsonb', nullable: true })
	downloads?: any

	@ApiPropertyOptional({ enum: PLUGIN_MARKETPLACE_REGISTRY_DOWNLOAD_STATUSES })
	@IsIn(PLUGIN_MARKETPLACE_REGISTRY_DOWNLOAD_STATUSES)
	@IsOptional()
	@Column({ type: 'varchar', default: 'idle' })
	downloadsStatus?: PluginMarketplaceRegistryDownloadStatus

	@ApiPropertyOptional({ type: () => Date })
	@IsOptional()
	@Column({ type: 'timestamptz', nullable: true })
	downloadsUpdatedAt?: Date | null

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	downloadsError?: string | null
}
