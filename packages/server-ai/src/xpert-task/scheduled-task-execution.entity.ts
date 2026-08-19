import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index } from 'typeorm'

export enum ScheduledTaskExecutionStatus {
    PENDING = 'pending',
    RUNNING = 'running',
    SUCCEEDED = 'succeeded',
    FAILED = 'failed'
}

@Entity('xpert_task_execution')
@Index('uq_xpert_task_execution_occurrence', ['taskId', 'occurrenceKey'], { unique: true })
@Index(['status', 'leaseExpiresAt'])
export class ScheduledTaskExecution extends TenantOrganizationBaseEntity {
    @ApiProperty({ type: () => String })
    @IsString()
    @Column({ type: 'uuid' })
    taskId: string

    @ApiProperty({ type: () => String })
    @IsString()
    @Column({ length: 160 })
    occurrenceKey: string

    @ApiProperty({ type: () => Date })
    @Column({ type: 'timestamptz' })
    scheduledAt: Date

    @ApiProperty({ enum: ScheduledTaskExecutionStatus })
    @IsEnum(ScheduledTaskExecutionStatus)
    @Column({ type: 'varchar', length: 16, default: ScheduledTaskExecutionStatus.PENDING })
    status: ScheduledTaskExecutionStatus

    @ApiPropertyOptional({ type: () => String })
    @IsOptional()
    @IsString()
    @Column({ type: 'varchar', length: 128, nullable: true })
    ownerId?: string | null

    @ApiPropertyOptional({ type: () => Date })
    @IsOptional()
    @Column({ type: 'timestamptz', nullable: true })
    leaseExpiresAt?: Date | null

    @ApiProperty({ type: () => Number })
    @IsInt()
    @Column({ type: 'integer', default: 0 })
    attempt: number

    @ApiPropertyOptional({ type: () => String })
    @IsOptional()
    @IsString()
    @Column({ type: 'uuid', nullable: true })
    conversationId?: string | null

    @ApiPropertyOptional({ type: () => String })
    @IsOptional()
    @IsString()
    @Column({ type: 'uuid', nullable: true })
    executionId?: string | null

    @ApiPropertyOptional({ type: () => Date })
    @IsOptional()
    @Column({ type: 'timestamptz', nullable: true })
    startedAt?: Date | null

    @ApiPropertyOptional({ type: () => Date })
    @IsOptional()
    @Column({ type: 'timestamptz', nullable: true })
    completedAt?: Date | null

    @ApiPropertyOptional({ type: () => String })
    @IsOptional()
    @Column({ type: 'text', nullable: true })
    lastError?: string | null
}
