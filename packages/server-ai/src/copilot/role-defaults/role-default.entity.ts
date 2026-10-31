import { DefaultModelRole, ModelBinding } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index } from 'typeorm'

@Entity('copilot_role_default')
@Index(['tenantId', 'scopeKey', 'role'], { unique: true })
export class CopilotRoleDefault extends TenantOrganizationBaseEntity {
    // A non-null scope key gives tenant defaults the same uniqueness guarantee as organization defaults.
    @Column({ type: 'varchar' })
    scopeKey: string

    @Column({ type: 'varchar' })
    role: DefaultModelRole

    @Column({ type: 'varchar' })
    mode: 'fixed' | 'inherit' | 'disabled'

    @Column({ type: 'json', nullable: true })
    binding: ModelBinding | null
}
