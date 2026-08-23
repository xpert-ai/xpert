import { IXpertProjectTaskExecution, TXpertProjectTaskExecutionStatus } from '@xpert-ai/contracts'
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm'
import { ChatConversation } from '../../chat-conversation/conversation.entity'
import { XpertProjectTask } from './project-task.entity'
import { XpertProjectBaseEntity } from './project.base'

@Entity('xpert_project_task_execution')
export class XpertProjectTaskExecution extends XpertProjectBaseEntity implements IXpertProjectTaskExecution {
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
