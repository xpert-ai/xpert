import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index } from 'typeorm'
import { FileAnchor } from '../domain/types'

@Entity('file_citation_anchor')
@Index(['fileAssetId'])
@Index(['anchorKey'])
export class FileCitationAnchor extends TenantOrganizationBaseEntity {
    @Column({ type: 'uuid' })
    fileAssetId: string

    @Column({ type: 'uuid', nullable: true })
    artifactId?: string

    @Column({ type: 'uuid', nullable: true })
    chunkId?: string

    @Column()
    anchorKey: string

    @Column({ nullable: true })
    label?: string

    @Column({ type: 'json', nullable: true })
    locator?: FileAnchor

    @Column({ type: 'json', nullable: true })
    metadata?: Record<string, unknown>
}
