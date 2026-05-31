import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index } from 'typeorm'
import { FileAnchor } from '../domain/types'

/**
 * Search/read unit exposed to agent tools. Chunks carry stable anchors so model
 * answers can cite page, sheet, slide, path, or chunk positions.
 */
@Entity('file_chunk')
@Index(['fileAssetId'])
@Index(['artifactId'])
export class FileChunk extends TenantOrganizationBaseEntity {
    @Column({ type: 'uuid' })
    fileAssetId: string

    @Column({ type: 'uuid', nullable: true })
    artifactId?: string

    @Column({ default: 0 })
    orderNo: number

    @Column({ type: 'text' })
    content: string

    @Column({ default: 0 })
    tokenCount: number

    @Column({ type: 'json', nullable: true })
    anchor?: FileAnchor

    @Column({ type: 'json', nullable: true })
    metadata?: Record<string, unknown>
}
