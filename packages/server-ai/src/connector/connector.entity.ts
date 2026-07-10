import type { ConnectorProfile, ConnectorStatus } from '@xpert-ai/plugin-sdk'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { XpertWorkspace } from '../xpert-workspace/workspace.entity'

@Entity('xpert_connector')
@Index(['workspaceId', 'provider'], { unique: true })
export class Connector extends TenantOrganizationBaseEntity {
    @Column({ type: 'uuid' })
    workspaceId: string

    @ManyToOne(() => XpertWorkspace, { onDelete: 'CASCADE' })
    @JoinColumn()
    workspace?: XpertWorkspace

    @Column({ type: 'varchar' })
    provider: string

    @Column({ type: 'varchar' })
    status: ConnectorStatus

    @Column({ type: 'uuid', nullable: true })
    appIntegrationId?: string | null

    @Column({ type: 'jsonb', nullable: true })
    profile?: ConnectorProfile | null

    @Column({ type: 'jsonb', nullable: true })
    scopes?: string[] | null

    @Column({ type: 'text', nullable: true })
    credentialCiphertext?: string | null

    @Column({ type: 'timestamptz', nullable: true })
    expiresAt?: Date | null

    @Column({ type: 'timestamptz', nullable: true })
    refreshExpiresAt?: Date | null

    @Column({ type: 'timestamptz', nullable: true })
    connectedAt?: Date | null

    @Column({ type: 'timestamptz', nullable: true })
    disconnectedAt?: Date | null

    @Column({ type: 'text', nullable: true })
    lastError?: string | null
}
