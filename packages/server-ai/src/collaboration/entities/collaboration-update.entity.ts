import type { CollaborationActorType, ICollaborationUpdate } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { CollaborationDocument } from './collaboration-document.entity'

@Entity('collaboration_update')
@Index(['documentId', 'sequenceNumber'], { unique: true })
@Index(['documentId', 'updateHash'], { unique: true })
@Index(['tenantId', 'organizationId', 'documentId'])
/** Bounded immutable journal used for update idempotency and operational diagnostics. */
export class CollaborationUpdate extends TenantOrganizationBaseEntity implements ICollaborationUpdate {
    @ManyToOne(() => CollaborationDocument, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'documentId' })
    document?: CollaborationDocument

    @Column({ type: 'uuid' })
    documentId: string

    @Column({ type: 'int' })
    sequenceNumber: number

    @Column({ type: 'text' })
    updateBase64: string

    @Column({ type: 'varchar' })
    updateHash: string

    @Column({ type: 'varchar', nullable: true })
    origin?: string | null

    @Column({ type: 'varchar', nullable: true })
    actorType?: CollaborationActorType | null

    @Column({ type: 'varchar', nullable: true })
    presenceId?: string | null

    @Column({ type: 'varchar', nullable: true })
    userId?: string | null
}
