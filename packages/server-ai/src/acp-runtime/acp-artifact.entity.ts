import { IAcpArtifact, TAcpArtifactKind } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsEnum, IsJSON, IsOptional, IsString } from 'class-validator'
import { Column, Entity, Index, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { AcpSession } from './acp-session.entity'
import { AcpSessionEvent } from './acp-session-event.entity'

@Entity('acp_artifact')
@Index(['sessionId', 'kind'])
export class AcpArtifact extends TenantOrganizationBaseEntity implements IAcpArtifact {
  @ApiProperty({ enum: ['stdout', 'stderr', 'diff', 'patch', 'file_snapshot', 'summary'] })
  @IsEnum(['stdout', 'stderr', 'diff', 'patch', 'file_snapshot', 'summary'])
  @Column({ type: 'varchar' })
  kind: TAcpArtifactKind

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  @Column({ type: 'varchar', nullable: true })
  title?: string | null

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  @Column({ type: 'varchar', nullable: true })
  mimeType?: string | null

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  @Column({ type: 'text', nullable: true })
  content?: string | null

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  @Column({ type: 'text', nullable: true })
  path?: string | null

  @ApiPropertyOptional({ type: Object })
  @IsJSON()
  @IsOptional()
  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, unknown> | null

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

  @RelationId((it: AcpArtifact) => it.session)
  @IsString()
  @Column({ type: 'varchar' })
  sessionId: string

  @ManyToOne(() => AcpSessionEvent, {
    nullable: true,
    onDelete: 'SET NULL'
  })
  @JoinColumn()
  event?: AcpSessionEvent | null

  @RelationId((it: AcpArtifact) => it.event)
  @IsString()
  @IsOptional()
  @Column({ type: 'varchar', nullable: true })
  eventId?: string | null
}
