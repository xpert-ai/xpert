import type { IMcpApiKey, McpApiKeySubjectType } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Exclude } from 'class-transformer'
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { McpPublication } from './mcp-publication.entity'

@Entity('mcp_api_key')
@Index('IDX_mcp_api_key_hash', ['keyHash'], { unique: true })
@Index('IDX_mcp_api_key_prefix', ['keyPrefix'], { unique: true })
@Index('IDX_mcp_api_key_publication', ['tenantId', 'publicationId', 'revokedAt', 'expiresAt'])
export class McpApiKey extends TenantOrganizationBaseEntity implements IMcpApiKey {
    @ManyToOne(() => McpPublication, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'publicationId' })
    publication?: McpPublication

    @Column({ type: 'uuid' })
    publicationId: string

    @Column({ type: 'varchar', length: 100 })
    name: string

    @Column({ type: 'varchar', length: 32 })
    keyPrefix: string

    @Exclude({ toPlainOnly: true })
    @Column({ type: 'char', length: 64, select: false })
    keyHash: string

    @Column({ type: 'varchar', length: 24 })
    subjectType: McpApiKeySubjectType

    @Column({ type: 'uuid' })
    subjectId: string

    @Column({ type: 'json', default: [] })
    scopes: string[]

    @Column({ type: 'timestamptz', nullable: true })
    expiresAt?: Date | null

    @Column({ type: 'timestamptz', nullable: true })
    lastUsedAt?: Date | null

    @Column({ type: 'timestamptz', nullable: true })
    revokedAt?: Date | null

    @Column({ type: 'uuid', nullable: true })
    revokedById?: string | null
}
