import {
	IPlugin,
	PLUGIN_CONFIGURATION_STATUS,
	PLUGIN_LEVEL,
	PluginConfigurationStatus,
	PluginLevel,
	PluginSourceConfig,
	PluginSource
} from '@metad/contracts'
import { ApiProperty } from '@nestjs/swagger'
import { Column, Entity, Index } from 'typeorm'
import { IsOptional, IsString } from 'class-validator'
import { TenantOrganizationBaseEntity } from '../core/entities/internal'

export function resolvePluginLevel(level?: string | null): PluginLevel {
	return level === PLUGIN_LEVEL.SYSTEM ? PLUGIN_LEVEL.SYSTEM : PLUGIN_LEVEL.ORGANIZATION
}

@Entity('plugin_instance')
@Index(['organizationId', 'pluginName'], { unique: true })
export class PluginInstance extends TenantOrganizationBaseEntity implements IPlugin {
	@ApiProperty({ type: () => String })
	@Column()
	@IsString()
	pluginName: string

	@ApiProperty({ type: () => String })
	@Column()
	@IsString()
	packageName: string

	@ApiProperty({ type: () => String, required: false })
	@Column({ nullable: true })
	@IsOptional()
	@IsString()
	version?: string

	@ApiProperty({ type: () => String })
	@Column({ type: 'varchar', nullable: true })
	@IsString()
	source?: PluginSource

	@ApiProperty({ type: () => Object, required: false })
	@Column({ type: 'jsonb', nullable: true })
	@IsOptional()
	sourceConfig?: PluginSourceConfig | null

	@ApiProperty({ enum: Object.values(PLUGIN_LEVEL), default: PLUGIN_LEVEL.ORGANIZATION })
	@Column({ type: 'varchar', default: PLUGIN_LEVEL.ORGANIZATION })
	level: PluginLevel

	@ApiProperty({ type: () => Object, required: false })
	@Column({ type: 'jsonb', default: {} })
	config: Record<string, any>

	@ApiProperty({ enum: Object.values(PLUGIN_CONFIGURATION_STATUS), required: false })
	@Column({ type: 'varchar', nullable: true })
	@IsOptional()
	@IsString()
	configurationStatus?: PluginConfigurationStatus | null

	@ApiProperty({ type: () => String, required: false })
	@Column({ type: 'text', nullable: true })
	@IsOptional()
	@IsString()
	configurationError?: string | null
}
