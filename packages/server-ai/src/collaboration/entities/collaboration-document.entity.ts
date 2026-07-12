import type {
    CollaborationDocumentStatus,
    CollaborationEngine,
    CollaborationMaterializationStatus,
    ICollaborationDocument
} from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index } from 'typeorm'

@Entity('collaboration_document')
@Index(['scopeKey', 'providerKey', 'resourceId'], { unique: true })
@Index(['tenantId', 'organizationId', 'providerKey', 'status'])
/** Persistent authoritative CRDT snapshot and its plugin materialization checkpoint. */
export class CollaborationDocument extends TenantOrganizationBaseEntity implements ICollaborationDocument {
    @Column({ type: 'varchar' })
    scopeKey: string

    @Column({ type: 'varchar' })
    providerKey: string

    @Column({ type: 'varchar' })
    resourceId: string

    @Column({ type: 'varchar', default: 'yjs' })
    engine: CollaborationEngine

    @Column({ type: 'int', default: 1 })
    schemaVersion: number

    @Column({ type: 'varchar', default: 'active' })
    status: CollaborationDocumentStatus

    @Column({ type: 'text' })
    stateBase64: string

    @Column({ type: 'text' })
    stateVectorBase64: string

    @Column({ type: 'int', default: 0 })
    sequenceNumber: number

    @Column({ type: 'int', default: 0 })
    updateCount: number

    @Column({ type: 'int', default: 0 })
    materializedSequence: number

    @Column({ type: 'varchar', default: 'ready' })
    materializationStatus: CollaborationMaterializationStatus

    @Column({ type: 'text', nullable: true })
    lastMaterializationError?: string | null

    @Column({ type: 'varchar', nullable: true })
    workspaceId?: string | null

    @Column({ type: 'varchar', nullable: true })
    projectId?: string | null

    @Column({ type: 'varchar', nullable: true })
    xpertId?: string | null

    @Column({ type: 'varchar', nullable: true })
    userId?: string | null

    @Column({ type: 'json', nullable: true })
    metadata?: Record<string, unknown> | null
}
