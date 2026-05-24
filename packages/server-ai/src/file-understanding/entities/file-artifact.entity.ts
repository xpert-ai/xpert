import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index } from 'typeorm'
import { FileAnchor, FileArtifactKind } from '../domain/types'

/**
 * Parser output at natural document granularity, such as page text, sheet JSON,
 * slide text, OCR text, or summaries.
 */
@Entity('file_artifact')
@Index(['fileAssetId', 'kind'])
export class FileArtifact extends TenantOrganizationBaseEntity {
    @Column({ type: 'uuid' })
    fileAssetId: string

    @Column({ type: 'varchar' })
    kind: FileArtifactKind

    @Column({ default: 0 })
    orderNo: number

    @Column({ nullable: true })
    mimeType?: string

    @Column({ type: 'text', nullable: true })
    content?: string

    @Column({ type: 'json', nullable: true })
    anchor?: FileAnchor

    @Column({ type: 'json', nullable: true })
    metadata?: Record<string, unknown>
}
