import { Exclude } from 'class-transformer'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index } from 'typeorm'

@Entity('xpert_mcp_consumer_oauth_credential')
@Index(['toolsetId', 'serverName', 'subjectType', 'subjectId'], { unique: true })
export class McpConsumerOAuthCredential extends TenantOrganizationBaseEntity {
    @Column({ type: 'uuid' })
    workspaceId: string

    @Column({ type: 'uuid' })
    toolsetId: string

    @Column({ type: 'varchar', length: 191 })
    serverName: string

    @Column({ type: 'varchar', length: 20 })
    subjectType: 'user' | 'organization'

    @Column({ type: 'uuid' })
    subjectId: string

    @Exclude({ toPlainOnly: true })
    @Column({ type: 'text', nullable: true, select: false })
    credentialCiphertext?: string | null

    @Column({ type: 'jsonb', nullable: true })
    scopes?: string[] | null

    @Column({ type: 'timestamptz', nullable: true })
    expiresAt?: Date | null

    @Column({ type: 'timestamptz', nullable: true })
    connectedAt?: Date | null

    @Column({ type: 'text', nullable: true })
    lastError?: string | null
}
