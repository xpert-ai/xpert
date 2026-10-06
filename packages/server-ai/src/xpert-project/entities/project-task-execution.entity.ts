import type { ProjectTaskDispatchIntent } from '../runtime/project-task-dispatch.schema'
import {
    IXpertProjectTaskExecution,
    TXpertProjectTaskExecutionStatus,
    AgentInvocationStatus,
    ProjectTaskExecutionPurpose,
    ProjectTaskSpecificationSnapshot
} from '@xpert-ai/contracts'
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { ChatConversation } from '../../chat-conversation/conversation.entity'
import { XpertProjectTask } from './project-task.entity'
import { XpertProjectBaseEntity } from './project.base'

@Index('IDX_project_task_execution_invocation', ['invocationId'], { unique: true })
@Index('IDX_project_task_execution_dispatch', ['projectId', 'createdById', 'dispatchRequestId'], { unique: true })
@Entity('xpert_project_task_execution')
@Index(['taskId', 'sourceKey'], { unique: true })
export class XpertProjectTaskExecution extends XpertProjectBaseEntity implements IXpertProjectTaskExecution {
    @Column({ type: 'int', nullable: true }) projectedTaskRevision?: number | null
    @Column({ type: 'int', default: -1 }) projectedInvocationRevision?: number
    @Column({ type: 'timestamptz', nullable: true }) dispatchNextAttemptAt?: Date | null
    @Column({ type: 'varchar', nullable: true }) dispatchError?: string | null

    @Column({ type: 'uuid', nullable: true }) invocationId?: string | null
    /** Read projection from the associated Invocation, never a second runtime ledger. */
    invocationStatus?: AgentInvocationStatus | null
    runtimeStartedAt?: string | null
    runtimeCompletedAt?: string | null
    @Column({ type: 'uuid', nullable: true }) dispatchRequestId?: string | null
    @Column({ type: 'varchar', nullable: true }) dispatchState?: 'pending' | 'submitted' | null
    @Column({ type: 'jsonb', nullable: true }) specificationSnapshot?: ProjectTaskSpecificationSnapshot | null
    @Column({ type: 'jsonb', nullable: true }) purpose?: ProjectTaskExecutionPurpose | null
    /** Server-only recovery intent; never serialize credentials, routing or configuration to task views. */
    @Column({ type: 'jsonb', nullable: true, select: false }) dispatchIntent?: ProjectTaskDispatchIntent | null

    @Column({ type: 'varchar', nullable: true }) sourceKey?: string | null
    @Column()
    taskId: string

    @ManyToOne(() => XpertProjectTask, (task) => task.executions, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'taskId' })
    task?: XpertProjectTask

    @Column({ nullable: true })
    conversationId?: string

    @ManyToOne(() => ChatConversation, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'conversationId' })
    conversation?: ChatConversation

    @Column({ nullable: true })
    threadId?: string

    @Column({ nullable: true })
    agentExecutionId?: string

    @Column({ nullable: true })
    xpertId?: string

    @Column({ nullable: true })
    agentKey?: string

    @Column({ type: 'integer', default: 1 })
    attempt: number

    @Column({ type: 'enum', enum: ['queued', 'running', 'succeeded', 'failed', 'cancelled'], default: 'queued' })
    status: TXpertProjectTaskExecutionStatus

    @Column({ type: 'text', nullable: true })
    inputSummary?: string

    @Column({ type: 'text', nullable: true })
    outputSummary?: string

    @Column({ type: 'text', nullable: true })
    error?: string

    @Column({ type: 'json', nullable: true })
    artifactIds?: string[]

    @Column({ type: 'timestamp with time zone', nullable: true })
    startedAt?: Date

    @Column({ type: 'timestamp with time zone', nullable: true })
    completedAt?: Date
}
