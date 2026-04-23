import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsOptional, IsString } from 'class-validator'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index } from 'typeorm'

@Entity('auto_task_template')
@Index('uq_auto_task_template_scope_key', ['tenantId', 'organizationId', 'createdById', 'key'], { unique: true })
export class AutoTaskTemplate extends TenantOrganizationBaseEntity {
  @ApiProperty({ type: () => String })
  @IsString()
  @Column({ length: 120 })
  key: string

  @ApiProperty({ type: () => String })
  @IsString()
  @Column({ length: 160 })
  title: string

  @ApiPropertyOptional({ type: () => String })
  @IsOptional()
  @IsString()
  @Column({ type: 'text', nullable: true })
  description?: string | null

  @ApiProperty({ type: () => String })
  @IsString()
  @Column({ type: 'text' })
  prompt: string

  @ApiPropertyOptional({ type: () => Object })
  @IsOptional()
  @Column({ type: 'json', nullable: true })
  defaultParams?: Record<string, unknown> | null

  @ApiPropertyOptional({ type: () => String })
  @IsOptional()
  @IsString()
  @Column({ nullable: true, length: 64 })
  icon?: string | null

  @ApiProperty({ type: () => Boolean })
  @IsBoolean()
  @Column({ default: false })
  builtin: boolean
}
