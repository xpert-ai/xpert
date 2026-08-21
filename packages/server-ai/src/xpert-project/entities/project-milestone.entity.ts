import { IXpertProjectMilestone, TXpertProjectMilestoneStatus } from '@xpert-ai/contracts'
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm'
import { XpertProjectBaseEntity } from './project.base'
import { XpertProjectPlan } from './project-plan.entity'

@Entity('xpert_project_milestone')
export class XpertProjectMilestone extends XpertProjectBaseEntity implements IXpertProjectMilestone {
    @Column()
    planId: string

    @ManyToOne(() => XpertProjectPlan, (plan) => plan.milestones, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'planId' })
    plan?: XpertProjectPlan

    @Column()
    name: string

    @Column({ type: 'text', nullable: true })
    description?: string

    @Column({ type: 'enum', enum: ['planned', 'in_progress', 'completed', 'blocked'], default: 'planned' })
    status: TXpertProjectMilestoneStatus

    @Column({ type: 'timestamp with time zone', nullable: true })
    dueDate?: Date

    @Column({ type: 'integer', default: 0 })
    order?: number
}
