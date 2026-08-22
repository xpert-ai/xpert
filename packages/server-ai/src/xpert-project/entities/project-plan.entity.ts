import { IXpertProjectPlan, TXpertProjectPlanStatus, TXpertProjectPlanView } from '@xpert-ai/contracts'
import { Column, Entity, OneToMany } from 'typeorm'
import { XpertProjectBaseEntity } from './project.base'
import { XpertProjectMilestone } from './project-milestone.entity'
import { XpertProjectSprint } from './project-sprint.entity'

@Entity('xpert_project_plan')
export class XpertProjectPlan extends XpertProjectBaseEntity implements IXpertProjectPlan {
    @Column()
    name: string

    @Column({ type: 'text', nullable: true })
    description?: string

    @Column({ type: 'enum', enum: ['draft', 'active', 'completed', 'archived'], default: 'active' })
    status: TXpertProjectPlanStatus

    @Column({ type: 'enum', enum: ['board', 'table', 'gantt', 'calendar', 'list'], default: 'board' })
    view?: TXpertProjectPlanView

    @Column({ type: 'timestamp with time zone', nullable: true })
    startDate?: Date

    @Column({ type: 'timestamp with time zone', nullable: true })
    dueDate?: Date

    @Column({ type: 'integer', default: 0 })
    order?: number

    @OneToMany(() => XpertProjectMilestone, (milestone) => milestone.plan, { cascade: true })
    milestones?: XpertProjectMilestone[]

    @OneToMany(() => XpertProjectSprint, (sprint) => sprint.plan, { cascade: true })
    sprints?: XpertProjectSprint[]
}
