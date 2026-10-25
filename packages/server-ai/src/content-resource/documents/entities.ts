import { Column, Entity, Index } from 'typeorm'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import type { ContentLocationChangeInput } from '@xpert-ai/plugin-sdk'

@Entity('content_document')
@Index('IDX_content_document_active_path', ['tenantId', 'organizationId', 'projectId', 'path'], {
    unique: true,
    where: '"status" <> \'deleted\''
})
export class ContentDocument extends TenantOrganizationBaseEntity {
    @Column({ type: 'uuid' }) projectId: string
    @Column({ type: 'text' }) path: string
    @Column({ type: 'varchar', length: 200 }) title: string
    @Column({ type: 'varchar', length: 160 }) modelKey: string
    @Column({ type: 'int', default: 1 }) schemaVersion: number
    @Column({ type: 'int', default: 1 }) epoch: number
    @Column({ type: 'uuid', nullable: true }) collaborationId: string | null
    @Column({ type: 'uuid', nullable: true }) headRevisionId: string | null
    @Column({ type: 'varchar', length: 64 }) fileHash: string
    @Column({ type: 'int', default: 0 }) sequence: number
    @Column({ type: 'varchar', length: 16, default: 'ready' }) status:
        | 'ready'
        | 'pending'
        | 'conflict'
        | 'failed'
        | 'deleted'
        | 'moving'
    @Column({ type: 'varchar', length: 160 }) sourceProvider: string
    @Column({ type: 'varchar', length: 256 }) sourceId: string
    @Column({ type: 'uuid' }) createdById: string
    @Column({ type: 'boolean', default: false }) projectionPending: boolean
}

@Entity('content_revision')
@Index(['tenantId', 'organizationId', 'resourceId', 'mutationId'], { unique: true })
export class ContentRevision extends TenantOrganizationBaseEntity {
    @Column({ type: 'uuid' }) resourceId: string
    @Column({ type: 'uuid', nullable: true }) parentId: string | null
    @Column({ type: 'varchar', length: 160 }) mutationId: string
    @Column({ type: 'varchar', length: 64 }) hash: string
    @Column({ type: 'varchar', length: 64 }) stateHash: string
    @Column({ type: 'varchar', length: 64 }) baseHash: string
    @Column({ type: 'int' }) epoch: number
    @Column({ type: 'int' }) sequence: number
    @Column({ type: 'varchar', length: 200 }) label: string
    @Column({ type: 'uuid' }) createdById: string
    @Column({ type: 'varchar', length: 16, default: 'prepared' }) status: 'prepared' | 'committed' | 'conflict'
}

@Entity('content_comment')
@Index(['tenantId', 'organizationId', 'resourceId'])
export class ContentComment extends TenantOrganizationBaseEntity {
    @Column({ type: 'uuid' }) resourceId: string
    @Column({ type: 'varchar', length: 160, nullable: true }) blockId: string | null
    @Column({ type: 'int' }) epoch: number
    @Column({ type: 'text' }) body: string
    @Column({ type: 'boolean', default: false }) resolved: boolean
    @Column({ type: 'uuid' }) createdById: string
}

@Entity('content_proposal')
@Index(['tenantId', 'organizationId', 'resourceId', 'mutationId'], { unique: true })
export class ContentProposal extends TenantOrganizationBaseEntity {
    @Column({ type: 'uuid' }) resourceId: string
    @Column({ type: 'uuid' }) mutationId: string
    @Column({ type: 'int' }) epoch: number
    @Column({ type: 'int' }) sequence: number
    @Column({ type: 'varchar', length: 160 }) blockId: string
    @Column({ type: 'text' }) before: string
    @Column({ type: 'text' }) after: string
    @Column({ type: 'varchar', length: 16, default: 'pending' }) status: 'pending' | 'accepted' | 'rejected' | 'stale'
    @Column({ type: 'uuid' }) createdById: string
    @Column({ type: 'uuid', nullable: true }) assistantId: string | null
    @Column({ type: 'text', nullable: true }) preparedUpdate: string | null
}

@Entity('content_location_change')
export class ContentLocationChange extends TenantOrganizationBaseEntity {
    @Column({ type: 'uuid' }) projectId: string
    @Column({ type: 'jsonb' }) input: ContentLocationChangeInput
    @Column({ type: 'jsonb' }) documents: Array<{ id: string; from: string; to: string; hash: string; epoch: number }>
    @Column({ type: 'varchar', length: 16, default: 'prepared' }) status: 'prepared' | 'committed' | 'projected'
}
export const contentDocumentEntities = [
    ContentDocument,
    ContentRevision,
    ContentProposal,
    ContentComment,
    ContentLocationChange
]
