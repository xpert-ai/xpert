import {
    IXpertProjectSwimlane,
    TXpertProjectAgentRole,
    TXpertProjectExecutionEnvironment,
    TXpertProjectSwimlaneKind
} from '@xpert-ai/contracts'
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm'
import { XpertProjectBaseEntity } from './project.base'
import { XpertProjectSprint } from './project-sprint.entity'

@Entity('xpert_project_swimlane')
export class XpertProjectSwimlane extends XpertProjectBaseEntity implements IXpertProjectSwimlane {
    @Column()
    sprintId: string

    @ManyToOne(() => XpertProjectSprint, (sprint) => sprint.swimlanes, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'sprintId' })
    sprint?: XpertProjectSprint

    @Column()
    key: string

    @Column()
    name: string

    @Column({ type: 'enum', enum: ['backlog', 'execution'], default: 'execution' })
    kind: TXpertProjectSwimlaneKind

    @Column({ type: 'integer', default: 0 })
    priority: number

    @Column({ type: 'integer', default: 1 })
    weight: number

    @Column({ type: 'integer', default: 0 })
    concurrencyLimit: number

    @Column({ type: 'integer', default: 0 })
    wipLimit: number

    @Column({ type: 'varchar', default: 'planner' })
    agentRole: TXpertProjectAgentRole

    @Column({ type: 'varchar', default: 'browser' })
    environmentType: TXpertProjectExecutionEnvironment

    @Column({ type: 'integer', default: 0 })
    sortOrder: number

    @Column({ type: 'varchar', default: 'software_delivery' })
    sourceStrategyType: IXpertProjectSwimlane['sourceStrategyType']
}
