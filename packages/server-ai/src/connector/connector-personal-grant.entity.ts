import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { Connector } from './connector.entity'
import { ConnectorPersonalAccount } from './connector-personal-account.entity'

@Entity('xpert_connector_personal_grant')
@Index('UQ_xpert_connector_personal_grant_binding_user', ['tenantId', 'connectorId', 'userId'], { unique: true })
export class ConnectorPersonalGrant extends TenantOrganizationBaseEntity {
    @Column({ type: 'uuid', update: false })
    connectorId: string

    @ManyToOne(() => Connector, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'connectorId' })
    connector?: Connector

    @Column({ type: 'uuid', update: false })
    accountId: string

    @ManyToOne(() => ConnectorPersonalAccount, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'accountId' })
    account?: ConnectorPersonalAccount

    @Column({ type: 'uuid', update: false })
    userId: string

    @Column({ type: 'timestamptz' })
    grantedAt: Date
}
