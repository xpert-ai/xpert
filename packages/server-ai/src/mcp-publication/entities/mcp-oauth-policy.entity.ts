import type { IMcpOAuthPolicy, McpOAuthSubjectMapping } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index, JoinColumn, OneToOne } from 'typeorm'
import { McpPublication } from './mcp-publication.entity'

@Entity('mcp_oauth_policy')
@Index('IDX_mcp_oauth_policy_publication', ['publicationId'], { unique: true })
export class McpOAuthPolicy extends TenantOrganizationBaseEntity implements IMcpOAuthPolicy {
    @OneToOne(() => McpPublication, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'publicationId' })
    publication?: McpPublication

    @Column({ type: 'uuid' })
    publicationId: string

    @Column({ type: 'text' })
    issuer: string

    @Column({ type: 'text' })
    audience: string

    @Column({ type: 'json', default: [] })
    requiredScopes: string[]

    @Column({ type: 'json' })
    subjectMapping: McpOAuthSubjectMapping

    @Column({ type: 'boolean', default: false })
    introspectionEnabled: boolean

    @Column({ type: 'text', nullable: true })
    introspectionEndpoint?: string | null

    @Column({ type: 'text', nullable: true })
    introspectionClientId?: string | null

    @Column({ type: 'text', nullable: true, select: false })
    introspectionClientSecretEncrypted?: string | null

    @Column({ type: 'boolean', default: false })
    introspectionClientSecretConfigured: boolean

    @Column({ type: 'boolean', default: false })
    enabled: boolean
}
