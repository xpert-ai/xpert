import {
    IXpertProjectTask,
    ProjectTaskDecision,
    IXpertProjectTaskStep,
    TXpertProjectTaskPriority,
    TXpertProjectTaskStatus
} from '@xpert-ai/contracts'
import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional } from 'class-validator'
import { Column, Entity, Index, OneToMany, VersionColumn } from 'typeorm'
import { XpertProjectTaskStep } from './project-task-step.entity'
import { XpertProjectTaskConversation } from './project-task-conversation.entity'
import { XpertProjectTaskExecution } from './project-task-execution.entity'
import { XpertProjectBaseEntity } from './project.base'

@Entity('xpert_project_task')
@Index(['projectId', 'providerKey', 'sourceKey'], { unique: true })
export class XpertProjectTask extends XpertProjectBaseEntity implements IXpertProjectTask {
    @Column({ type: 'jsonb', default: '[]' }) decisions: ProjectTaskDecision[]
    @Column({ type: 'varchar', nullable: true }) providerKey?: string | null
    @Column({ type: 'varchar', nullable: true }) sourceKey?: string | null
    @Column({ type: 'varchar', nullable: true }) sourceRevision?: string | null
    @VersionColumn({ default: 1 }) revision: number
    @Column({ type: 'varchar', default: 'task' }) kind: 'task' | 'summary' | 'milestone'
    @Column({ type: 'uuid', nullable: true }) parentTaskId?: string | null
    @Column({ type: 'json', default: '[]' }) predecessorIds: string[]
    @Column({ type: 'timestamptz', nullable: true }) plannedStartAt?: Date | null
    @Column({ type: 'timestamptz', nullable: true }) plannedEndAt?: Date | null
    @Column({ type: 'double precision', nullable: true }) estimatedDurationMs?: number | null
    @Column({ type: 'text', nullable: true }) diagnostic?: string | null

    @Column({ nullable: true })
    threadId?: string

    @Column({ nullable: true })
    name: string

    @Column({ nullable: true })
    title?: string

    @Column({ type: 'text', nullable: true })
    description?: string

    @Column({ type: 'jsonb', default: '[]' })
    requirements?: string[]

    /** Business classification; kind separately describes graph structure. */
    @Column({ type: 'varchar', nullable: true })
    type: string

    @Column({
        nullable: true,
        type: 'enum',
        enum: [
            'todo',
            'in_progress',
            'review',
            'paused',
            'done',
            'blocked',
            'cancelled',
            'pending',
            'completed',
            'failed'
        ]
    })
    status: TXpertProjectTaskStatus | 'pending' | 'completed' | 'failed'

    @Column({ nullable: true, type: 'enum', enum: ['urgent', 'high', 'medium', 'low'] })
    priority?: TXpertProjectTaskPriority

    @Column({ nullable: true })
    assigneeId?: string

    @Column({ nullable: true })
    assigneeXpertId?: string

    @Column({ nullable: true, type: 'timestamp with time zone' })
    dueDate?: Date

    @Column({ nullable: true })
    planId?: string

    @Column({ nullable: true })
    milestoneId?: string

    @Column({ nullable: true })
    column?: string

    @Column({ nullable: true, type: 'integer', default: 0 })
    order?: number

    @Column({ nullable: true })
    startTime: Date

    @Column({ nullable: true })
    endTime: Date

    @ApiPropertyOptional({ type: () => XpertProjectTaskStep, isArray: true })
    @IsOptional()
    @OneToMany(() => XpertProjectTaskStep, (step) => step.task, {
        cascade: true
    })
    steps: IXpertProjectTaskStep[]

    @OneToMany(() => XpertProjectTaskConversation, (link) => link.task, { cascade: true })
    conversations?: XpertProjectTaskConversation[]

    @OneToMany(() => XpertProjectTaskExecution, (execution) => execution.task, { cascade: true })
    executions?: XpertProjectTaskExecution[]
}
