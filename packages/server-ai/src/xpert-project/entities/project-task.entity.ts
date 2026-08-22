import {
    IXpertProjectTask,
    IXpertProjectTaskStep,
    TXpertProjectTaskPriority,
    TXpertProjectTaskStatus
} from '@xpert-ai/contracts'
import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional } from 'class-validator'
import { Column, Entity, OneToMany } from 'typeorm'
import { XpertProjectTaskStep } from './project-task-step.entity'
import { XpertProjectTaskConversation } from './project-task-conversation.entity'
import { XpertProjectTaskExecution } from './project-task-execution.entity'
import { XpertProjectBaseEntity } from './project.base'

@Entity('xpert_project_task')
export class XpertProjectTask extends XpertProjectBaseEntity implements IXpertProjectTask {
    @Column({ nullable: true })
    threadId?: string

    @Column({ nullable: true })
    name: string

    @Column({ nullable: true })
    title?: string

    @Column({ type: 'text', nullable: true })
    description?: string

    @Column({ nullable: true })
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
