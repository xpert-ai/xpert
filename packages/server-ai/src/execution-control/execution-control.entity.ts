import {
    IExecutionControl,
    TExecutionControlIntent,
    TExecutionOwnership,
    TExecutionWorkReceipt
} from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index } from 'typeorm'

@Entity('execution_control')
@Index('IDX_execution_control_root', ['rootExecutionId'])
export class ExecutionControl extends TenantOrganizationBaseEntity implements IExecutionControl {
    /** Business identity stays unique; persistence uses the inherited id primary key. */
    @Index('IDX_execution_control_execution', { unique: true })
    @Column({ type: 'uuid' })
    executionId: string

    @Column({ type: 'varchar' })
    threadId: string

    @Column({ type: 'uuid' })
    rootExecutionId: string

    @Column({ type: 'jsonb' })
    ownership: TExecutionOwnership

    /** Attached ancestry, excluding independent/shared boundaries and including self. */
    @Column({ type: 'jsonb' })
    ancestors: string[]

    @Column({ type: 'varchar', default: 'running' })
    desired: TExecutionControlIntent

    @Column({ type: 'int', default: 1 })
    revision: number

    @Column({ type: 'boolean', default: false })
    graphEnded: boolean

    /** Stored only on the control root; settled IDs prevent duplicate admissions. */
    @Column({ type: 'jsonb', default: [] })
    work: TExecutionWorkReceipt[]
}
