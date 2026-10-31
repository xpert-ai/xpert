import { TXpertTeamDraft } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity } from 'typeorm'

@Entity('model_replacement_operation')
export class ModelReplacementOperation extends TenantOrganizationBaseEntity {
    @Column({ type: 'uuid' }) xpertId: string
    @Column({ type: 'uuid' }) actorId: string
    @Column({ type: 'json' }) beforeDraft: TXpertTeamDraft
    @Column({ type: 'varchar' }) afterRevision: string
    @Column({ type: 'boolean', default: false }) restored: boolean
}
