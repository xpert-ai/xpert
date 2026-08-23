import { IXpertProjectSprint, TXpertProjectSprintStatus, TXpertProjectSprintStrategy } from '@xpert-ai/contracts'
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm'
import { XpertProjectBaseEntity } from './project.base'
import { XpertProjectPlan } from './project-plan.entity'
import { XpertProjectSwimlane } from './project-swimlane.entity'

@Entity('xpert_project_sprint')
export class XpertProjectSprint extends XpertProjectBaseEntity implements IXpertProjectSprint {
    @Column({ nullable: true })
    planId?: string

    @ManyToOne(() => XpertProjectPlan, (plan) => plan.sprints, { nullable: true, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'planId' })
    plan?: XpertProjectPlan

    @Column({ type: 'text' })
    goal: string

    @Column({ type: 'enum', enum: ['planned', 'running', 'review', 'done'], default: 'planned' })
    status: TXpertProjectSprintStatus

    @Column({ type: 'varchar', default: 'software_delivery' })
    strategyType: TXpertProjectSprintStrategy

    @Column({ type: 'timestamp with time zone', nullable: true })
    startAt?: Date

    @Column({ type: 'timestamp with time zone', nullable: true })
    endAt?: Date

    @Column({ type: 'text', nullable: true })
    retrospective?: string

    @OneToMany(() => XpertProjectSwimlane, (swimlane) => swimlane.sprint, { cascade: true })
    swimlanes?: XpertProjectSwimlane[]
}
