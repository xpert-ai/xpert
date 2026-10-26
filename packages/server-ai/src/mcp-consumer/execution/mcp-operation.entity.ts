import { Column, Entity, Index } from 'typeorm'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import type { IMcpRemoteOperation, McpOperationRecord } from '@xpert-ai/contracts'

/** Initial tool arguments and credentials are not stored here; input answers and results are scoped business data. */
@Entity('mcp_remote_operation')
@Index(['tenantId', 'operationKey'], { unique: true })
export class McpRemoteOperation extends TenantOrganizationBaseEntity implements IMcpRemoteOperation {
    // The operation identity supplies this inherited primary key; never generate a replacement on recovery.
    declare id: string
    declare tenantId: string
    @Column('varchar') operationKey: string
    @Column('uuid') targetId: string
    @Column('uuid') generation: string
    @Column('jsonb') record: McpOperationRecord
    @Column({ type: 'timestamptz', nullable: true }) nextControlAt: Date | null
}
