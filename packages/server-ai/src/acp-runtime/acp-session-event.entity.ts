import { IAcpSessionEvent, TAcpSessionEventType } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsEnum, IsJSON, IsNumber, IsOptional, IsString } from 'class-validator'
import { Column, Entity, Index, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { AcpSession } from './acp-session.entity'

@Entity('acp_session_event')
@Index(['sessionId', 'sequence'], { unique: true })
export class AcpSessionEvent extends TenantOrganizationBaseEntity implements IAcpSessionEvent {
  @ApiProperty({ type: Number })
  @IsNumber()
  @Column({ type: 'integer' })
  sequence: number

  @ApiProperty({
    enum: [
      'session_created',
      'session_queued',
      'session_started',
      'session_completed',
      'session_failed',
      'session_canceled',
      'config_error',
      'terminal_output',
      'artifact_created'
    ]
  })
  @IsEnum([
    'session_created',
    'session_queued',
    'session_started',
    'session_completed',
    'session_failed',
    'session_canceled',
    'config_error',
    'terminal_output',
    'artifact_created'
  ])
  @Column({ type: 'varchar' })
  type: TAcpSessionEventType

  @ApiPropertyOptional({ type: Object })
  @IsJSON()
  @IsOptional()
  @Column({ type: 'json', nullable: true })
  payload?: Record<string, unknown> | null

  @ApiPropertyOptional({ type: Object })
  @IsJSON()
  @IsOptional()
  @Column({ type: 'json', nullable: true })
  redactedPayload?: Record<string, unknown> | null

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  @Column({ type: 'varchar', nullable: true })
  executionId?: string | null

  @ManyToOne(() => AcpSession, {
    nullable: false,
    onDelete: 'CASCADE'
  })
  @JoinColumn()
  session: AcpSession

  @RelationId((it: AcpSessionEvent) => it.session)
  @IsString()
  @Column({ type: 'varchar' })
  sessionId: string
}
