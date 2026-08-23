import { IXpertProjectAutomationRun, TXpertProjectAutomationRunStatus } from '@xpert-ai/contracts'
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm'
import { XpertProjectBaseEntity } from './project.base'
import { XpertProjectAutomation } from './project-automation.entity'

@Entity('xpert_project_automation_run')
export class XpertProjectAutomationRun extends XpertProjectBaseEntity implements IXpertProjectAutomationRun {
    @Column()
    automationId: string

    @ManyToOne(() => XpertProjectAutomation, (automation) => automation.runs, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'automationId' })
    automation?: XpertProjectAutomation

    @Column({ type: 'enum', enum: ['queued', 'running', 'succeeded', 'failed', 'cancelled'], default: 'queued' })
    status: TXpertProjectAutomationRunStatus

    @Column()
    occurrenceKey: string

    @Column({ nullable: true })
    jobId?: string

    @Column({ type: 'timestamp with time zone', nullable: true })
    startedAt?: Date

    @Column({ type: 'timestamp with time zone', nullable: true })
    completedAt?: Date

    @Column({ type: 'text', nullable: true })
    error?: string

    @Column({ type: 'json', nullable: true })
    output?: Record<string, unknown>
}
