import { IXpertProjectActivity } from '@xpert-ai/contracts'
import { Column, Entity } from 'typeorm'
import { XpertProjectBaseEntity } from './project.base'

@Entity('xpert_project_activity')
export class XpertProjectActivity extends XpertProjectBaseEntity implements IXpertProjectActivity {
    @Column()
    type: string

    @Column({ nullable: true })
    entityType?: string

    @Column({ nullable: true })
    entityId?: string

    @Column({ type: 'text' })
    summary: string

    @Column({ type: 'json', nullable: true })
    payload?: Record<string, unknown>
}
