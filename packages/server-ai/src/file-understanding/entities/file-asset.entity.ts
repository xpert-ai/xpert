import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index } from 'typeorm'
import { FileAssetPurpose, FileAssetStatus, FileCapability, FileParseMode } from '../domain/types'

const bigintNumberTransformer = {
    to: (value?: number | null) => value,
    from: (value: string | null) => (value !== null ? Number(value) : null)
}

/**
 * Platform-level file handle for agent understanding. StorageFile owns object
 * storage; FileAsset owns parser status, capabilities, context links, and
 * workspace projection metadata.
 */
@Entity('file_asset')
@Index(['storageFileId'])
@Index(['conversationId'])
@Index(['threadId'])
@Index(['sha256'])
export class FileAsset extends TenantOrganizationBaseEntity {
    @Column({ type: 'uuid', nullable: true })
    storageFileId?: string

    @Column({ nullable: true })
    conversationId?: string

    @Column({ nullable: true })
    threadId?: string

    @Column({ nullable: true })
    projectId?: string

    @Column({ nullable: true })
    xpertId?: string

    @Column({ nullable: true })
    userId?: string

    @Column({ nullable: true })
    originalName?: string

    @Column({ nullable: true })
    fileName?: string

    @Column({ nullable: true })
    mimeType?: string

    @Column({ type: 'bigint', default: 0, nullable: true, transformer: bigintNumberTransformer })
    size?: number

    @Column({ nullable: true })
    sha256?: string

    @Column({ type: 'varchar', default: 'chat_attachment' })
    purpose: FileAssetPurpose

    @Column({ type: 'varchar', default: 'auto' })
    parseMode: FileParseMode

    @Column({ type: 'varchar', default: 'uploaded' })
    status: FileAssetStatus

    @Column({ type: 'json', nullable: true })
    capabilities?: FileCapability[]

    @Column({ nullable: true })
    workspacePath?: string

    @Column({ type: 'json', nullable: true })
    metadata?: Record<string, unknown>

    @Column({ type: 'text', nullable: true })
    summary?: string

    @Column({ type: 'text', nullable: true })
    error?: string

    @Column({ type: 'timestamptz', nullable: true })
    parsedAt?: Date

    @Column({ type: 'timestamptz', nullable: true })
    failedAt?: Date
}
