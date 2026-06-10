import {
    IPluginResourceInstallation,
    PLUGIN_COMPONENT_TYPE,
    PLUGIN_RESOURCE_INSTALLATION_STATUS,
    PLUGIN_RESOURCE_RUNTIME_TYPE,
    PluginComponentType,
    PluginResourceInstallationStatus,
    PluginResourceRuntimeType
} from '@xpert-ai/contracts'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator'
import { Column, Entity, Index } from 'typeorm'
import { WorkspaceBaseEntity } from '../core/entities/base.entity'

@Entity('plugin_resource_installation')
@Index(['workspaceId', 'xpertId', 'agentKey', 'pluginName', 'componentType', 'componentKey'])
export class PluginResourceInstallation extends WorkspaceBaseEntity implements IPluginResourceInstallation {
    declare workspaceId: string

    @ApiProperty({ type: () => String })
    @IsString()
    @Column()
    pluginName: string

    @ApiProperty({ enum: Object.values(PLUGIN_COMPONENT_TYPE) })
    @IsIn(Object.values(PLUGIN_COMPONENT_TYPE))
    @Column({ type: 'varchar' })
    componentType: PluginComponentType

    @ApiProperty({ type: () => String })
    @IsString()
    @Column()
    componentKey: string

    @ApiPropertyOptional({ type: () => String })
    @IsString()
    @IsOptional()
    @Column({ nullable: true })
    xpertId?: string | null

    @ApiPropertyOptional({ type: () => String })
    @IsString()
    @IsOptional()
    @Column({ nullable: true })
    agentKey?: string | null

    @ApiProperty({ enum: Object.values(PLUGIN_RESOURCE_RUNTIME_TYPE) })
    @IsIn(Object.values(PLUGIN_RESOURCE_RUNTIME_TYPE))
    @Column({ type: 'varchar' })
    runtimeType: PluginResourceRuntimeType

    @ApiPropertyOptional({ type: () => String })
    @IsString()
    @IsOptional()
    @Column({ nullable: true })
    runtimeId?: string | null

    @ApiPropertyOptional({ type: () => String })
    @IsString()
    @IsOptional()
    @Column({ nullable: true })
    runtimeNodeKey?: string | null

    @ApiProperty({ type: () => String })
    @IsString()
    @Column()
    definitionHash: string

    @ApiProperty({ enum: Object.values(PLUGIN_RESOURCE_INSTALLATION_STATUS) })
    @IsIn(Object.values(PLUGIN_RESOURCE_INSTALLATION_STATUS))
    @Column({ type: 'varchar' })
    status: PluginResourceInstallationStatus

    @ApiPropertyOptional({ type: () => Object })
    @IsOptional()
    @Column({ type: 'jsonb', nullable: true })
    config?: IPluginResourceInstallation['config']

    @ApiProperty({ type: () => Boolean })
    @IsBoolean()
    @Column({ default: true })
    enabled: boolean
}
