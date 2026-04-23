import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsOptional, IsString } from 'class-validator'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity } from 'typeorm'

export type AutoTaskFrequency = 'once' | 'daily' | 'weekly'

@Entity('auto_task')
export class AutoTask extends TenantOrganizationBaseEntity {
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

  @ApiProperty({ type: () => String })
  @IsString()
  @Column({ length: 255 })
  repo: string

  @ApiProperty({ type: () => String })
  @IsString()
  @Column({ length: 255 })
  branch: string

  @ApiProperty({ type: () => String })
  @IsString()
  @Column({ length: 255 })
  schedule: string

  @ApiProperty({ enum: ['once', 'daily', 'weekly'] })
  @Column({ type: 'varchar', length: 32, default: 'daily' })
  frequency: AutoTaskFrequency

  @ApiProperty({ type: () => Boolean })
  @IsBoolean()
  @Column({ default: true })
  enabled: boolean

  @ApiPropertyOptional({ type: () => String })
  @IsOptional()
  @IsString()
  @Column({ nullable: true })
  templateId?: string | null

  @ApiPropertyOptional({ type: () => Date })
  @IsOptional()
  @Column({ type: 'timestamptz', nullable: true })
  runAt?: Date | null

  @ApiPropertyOptional({ type: () => String })
  @IsOptional()
  @IsString()
  @Column({ nullable: true, length: 64 })
  timeZone?: string | null

  @ApiPropertyOptional({ type: () => String })
  @IsOptional()
  @IsString()
  @Column({ nullable: true, length: 64 })
  pushChannel?: string | null

  @ApiPropertyOptional({ type: () => Object })
  @IsOptional()
  @Column({ type: 'json', nullable: true })
  params?: Record<string, unknown> | null

  @ApiPropertyOptional({ type: () => Date })
  @IsOptional()
  @Column({ type: 'timestamptz', nullable: true })
  lastRunAt?: Date | null

  @ApiPropertyOptional({ type: () => Date })
  @IsOptional()
  @Column({ type: 'timestamptz', nullable: true })
  nextRunAt?: Date | null
}

