import { IXpertProjectAutomation } from '@xpert-ai/contracts'
import { Column, Entity, OneToMany } from 'typeorm'
import { XpertProjectBaseEntity } from './project.base'
import { XpertProjectAutomationRun } from './project-automation-run.entity'

@Entity('xpert_project_automation')
export class XpertProjectAutomation extends XpertProjectBaseEntity implements IXpertProjectAutomation {
    @Column()
    name: string

    @Column({ default: false })
    enabled: boolean

    @Column({ type: 'json' })
    trigger: IXpertProjectAutomation['trigger']

    @Column({ type: 'json' })
    actions: Array<Record<string, unknown>>

    @Column({ type: 'timestamp with time zone', nullable: true })
    lastRunAt?: Date

    @Column({ type: 'timestamp with time zone', nullable: true })
    nextRunAt?: Date

    @OneToMany(() => XpertProjectAutomationRun, (run) => run.automation)
    runs?: XpertProjectAutomationRun[]
}
