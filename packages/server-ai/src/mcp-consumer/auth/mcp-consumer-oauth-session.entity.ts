import { Exclude } from 'class-transformer'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index } from 'typeorm'

@Entity('xpert_mcp_consumer_oauth_session')
export class McpConsumerOAuthSession extends TenantOrganizationBaseEntity {
    @Index({ unique: true })
    @Column({ type: 'varchar', length: 128 })
    stateHash: string

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

    @Column({ type: 'uuid' })
    userId: string

    @Column({ type: 'text' })
    serverUrl: string

    @Column({ type: 'text' })
    redirectUri: string

    @Column({ type: 'text', nullable: true })
    authorizationUrl?: string | null

    @Exclude({ toPlainOnly: true })
    @Column({ type: 'text', nullable: true, select: false })
    codeVerifierCiphertext?: string | null

    @Column({ type: 'jsonb', nullable: true })
    scopes?: string[] | null

    @Column({ type: 'timestamptz' })
    expiresAt: Date

    @Column({ type: 'timestamptz', nullable: true })
    consumedAt?: Date | null
}
