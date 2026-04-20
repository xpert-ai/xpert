import {
  IAcpSession,
  TAcpPermissionProfile,
  TAcpSessionMetadata,
  TAcpSessionMode,
  TAcpSessionStatus,
  THarnessType,
  TRuntimeKind
} from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsEnum, IsJSON, IsNumber, IsOptional, IsString } from 'class-validator'
import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, RelationId } from 'typeorm'
import { XpertAgentExecution } from '../xpert-agent-execution/agent-execution.entity'
import { AcpArtifact } from './acp-artifact.entity'
import { AcpSessionEvent } from './acp-session-event.entity'

@Entity('acp_session')
@Index(['executionId'], { unique: true })
@Index(['tenantId', 'organizationId', 'status'])
export class AcpSession extends TenantOrganizationBaseEntity implements IAcpSession {
  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  @Column({ type: 'varchar', nullable: true })
  title?: string | null

  @ApiProperty({ enum: ['acp_session'] })
  @IsEnum(['acp_session'])
  @Column({ type: 'varchar', default: 'acp_session' })
  runtimeKind: Extract<TRuntimeKind, 'acp_session'>

  @ApiProperty({ enum: ['codex', 'claude_code'] })
  @IsEnum(['codex', 'claude_code'])
  @Column({ type: 'varchar' })
  harnessType: THarnessType

  @ApiProperty({ enum: ['oneshot'] })
  @IsEnum(['oneshot'])
  @Column({ type: 'varchar', default: 'oneshot' })
  mode: TAcpSessionMode

  @ApiProperty({ enum: ['read_only', 'workspace_write', 'full_exec'] })
  @IsEnum(['read_only', 'workspace_write', 'full_exec'])
  @Column({ type: 'varchar', default: 'workspace_write' })
  permissionProfile: TAcpPermissionProfile

  @ApiProperty({
    enum: ['pending', 'queued', 'running', 'success', 'error', 'timeout', 'canceled']
  })
  @IsEnum(['pending', 'queued', 'running', 'success', 'error', 'timeout', 'canceled'])
  @Column({ type: 'varchar', default: 'pending' })
  status: TAcpSessionStatus

  @ApiProperty({ type: String })
  @IsString()
  @Column({ type: 'text' })
  prompt: string

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  @Column({ type: 'text', nullable: true })
  summary?: string | null

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  @Column({ type: 'text', nullable: true })
  error?: string | null

  @ApiPropertyOptional({ type: Number })
  @IsNumber()
  @IsOptional()
  @Column({ type: 'integer', nullable: true })
  timeoutMs?: number | null

  @ApiPropertyOptional({ type: Date })
  @Column({ type: 'timestamptz', nullable: true })
  startedAt?: Date | null

  @ApiPropertyOptional({ type: Date })
  @Column({ type: 'timestamptz', nullable: true })
  completedAt?: Date | null

  @ApiPropertyOptional({ type: Date })
  @Column({ type: 'timestamptz', nullable: true })
  canceledAt?: Date | null

  @ApiPropertyOptional({ type: Number })
  @IsNumber()
  @IsOptional()
  @Column({ type: 'integer', nullable: true })
  lastExitCode?: number | null

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  @Column({ type: 'varchar', nullable: true })
  environmentId?: string | null

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  @Column({ type: 'varchar', nullable: true })
  parentExecutionId?: string | null

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  @Column({ type: 'varchar', nullable: true })
  xpertId?: string | null

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  @Column({ type: 'varchar', nullable: true })
  threadId?: string | null

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  @Column({ type: 'varchar', nullable: true })
  conversationId?: string | null

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  @Column({ type: 'text', nullable: true })
  workingDirectory?: string | null

  @ApiPropertyOptional({ type: Object })
  @IsJSON()
  @IsOptional()
  @Column({ type: 'json', nullable: true })
  metadata?: TAcpSessionMetadata | null

  @ApiProperty({ type: () => XpertAgentExecution })
  @ManyToOne(() => XpertAgentExecution, {
    nullable: true,
    onDelete: 'CASCADE'
  })
  @JoinColumn()
  execution?: XpertAgentExecution | null

  @ApiPropertyOptional({ type: String })
  @RelationId((it: AcpSession) => it.execution)
  @IsString()
  @IsOptional()
  @Column({ type: 'varchar', nullable: true })
  executionId?: string | null

  @OneToMany(() => AcpSessionEvent, (event) => event.session)
  events?: AcpSessionEvent[]

  @OneToMany(() => AcpArtifact, (artifact) => artifact.session)
  artifacts?: AcpArtifact[]
}
