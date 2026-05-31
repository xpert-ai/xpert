import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index } from 'typeorm'

@Entity('file_embedding')
@Index(['fileAssetId'])
@Index(['chunkId'])
export class FileEmbedding extends TenantOrganizationBaseEntity {
    @Column({ type: 'uuid' })
    fileAssetId: string

    @Column({ type: 'uuid' })
    chunkId: string

    @Column({ nullable: true })
    provider?: string

    @Column({ nullable: true })
    model?: string

    @Column({ nullable: true })
    vectorId?: string

    @Column({ type: 'json', nullable: true })
    metadata?: Record<string, unknown>
}
