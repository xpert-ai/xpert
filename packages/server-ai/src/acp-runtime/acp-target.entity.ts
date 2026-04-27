import {
  IAcpTarget,
  TAcpPermissionProfile,
  TAcpSessionMode,
  TAcpTargetCapabilities,
  TAcpTargetKind,
  TAcpTransport
} from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsEnum, IsJSON, IsNumber, IsOptional, IsString } from 'class-validator'
import { Column, Entity, Index } from 'typeorm'

@Entity('acp_target')
@Index(['tenantId', 'organizationId', 'enabled'])
@Index(['tenantId', 'organizationId', 'kind'])
export class AcpTarget extends TenantOrganizationBaseEntity implements IAcpTarget {
  @ApiProperty({ type: String })
  @IsString()
  @Column({ type: 'varchar' })
  label: string

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  @Column({ type: 'text', nullable: true })
  description?: string | null

  @ApiProperty({
    enum: ['remote_xpert_acp']
  })
  @IsEnum(['remote_xpert_acp'])
  @Column({ type: 'varchar' })
  kind: TAcpTargetKind

  @ApiProperty({ enum: ['http'] })
  @IsEnum(['http'])
  @Column({ type: 'varchar' })
  transport: TAcpTransport

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  @Column({ type: 'text', nullable: true })
  commandOrEndpoint?: string | null

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  @Column({ type: 'text', nullable: true })
  authRef?: string | null

  @ApiProperty({ enum: ['oneshot', 'persistent'] })
  @IsEnum(['oneshot', 'persistent'])
  @Column({ type: 'varchar', default: 'persistent' })
  defaultMode: TAcpSessionMode

  @ApiProperty({ enum: ['read_only', 'workspace_write', 'full_exec'] })
  @IsEnum(['read_only', 'workspace_write', 'full_exec'])
  @Column({ type: 'varchar', default: 'workspace_write' })
  permissionProfile: TAcpPermissionProfile

  @ApiPropertyOptional({ type: Number })
  @IsNumber()
  @IsOptional()
  @Column({ type: 'integer', nullable: true })
  timeoutSeconds?: number | null

  @ApiProperty({ type: Boolean })
  @IsBoolean()
  @Column({ type: 'boolean', default: true })
  enabled: boolean

  @ApiPropertyOptional({ type: Object })
  @IsJSON()
  @IsOptional()
  @Column({ type: 'json', nullable: true })
  capabilities?: TAcpTargetCapabilities | null

  @ApiPropertyOptional({ type: Object })
  @IsJSON()
  @IsOptional()
  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, unknown> | null
}
