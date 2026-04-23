import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString } from 'class-validator'
import { Column, Entity } from 'typeorm'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'

export type ScheduleNoteStatus = 'pending' | 'done'
export type ScheduleNoteType = 'note' | 'task'

@Entity('schedule_note')
export class ScheduleNote extends TenantOrganizationBaseEntity {
  @ApiProperty({ type: () => String })
  @IsString()
  @Column({ length: 160 })
  title: string

  @ApiPropertyOptional({ type: () => String })
  @IsOptional()
  @IsString()
  @Column({ type: 'text', nullable: true })
  content?: string | null

  @ApiProperty({ type: () => String, description: 'YYYY-MM-DD' })
  @IsString()
  @Column({ type: 'date' })
  date: string

  @ApiPropertyOptional({ type: () => Date })
  @IsOptional()
  @Column({ type: 'timestamptz', nullable: true })
  remindAt?: Date | null

  @ApiProperty({ enum: ['note', 'task'] })
  @Column({ type: 'varchar', length: 16, default: 'note' })
  type: ScheduleNoteType

  @ApiProperty({ enum: ['pending', 'done'] })
  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status: ScheduleNoteStatus
}
