import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { XpertToolset } from '../../xpert-toolset/xpert-toolset.entity'

/** Only internal provisioning writes this link. Credentials remain on the tenant-owned source. */
@Entity('app_platform_toolset_binding')
@Index(['targetId'], { unique: true })
export class PlatformToolsetBinding extends TenantOrganizationBaseEntity {
    @Column({ type: 'uuid' }) targetId: string
    @ManyToOne(() => XpertToolset, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'targetId' }) target: XpertToolset
    @Column({ type: 'uuid' }) sourceId: string
    @ManyToOne(() => XpertToolset, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'sourceId' }) source: XpertToolset
}
