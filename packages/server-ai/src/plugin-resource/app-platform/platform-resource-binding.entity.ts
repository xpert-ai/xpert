import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { Knowledgebase } from '../../knowledgebase/knowledgebase.entity'
import { AppPlatformDelivery } from './app-platform-delivery.entity'

/** Keep the producer's resource alive while any platform consumer retains its binding. */
@Entity('app_platform_resource_binding')
@Index(['deliveryId', 'consumerApp', 'resourceKey'], { unique: true })
export class PlatformResourceBinding extends TenantOrganizationBaseEntity {
    @Column({ type: 'uuid' }) deliveryId: string
    @ManyToOne(() => AppPlatformDelivery, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'deliveryId' }) delivery: AppPlatformDelivery
    @Column({ type: 'varchar' }) consumerApp: string
    @Column({ type: 'varchar' }) resourceKey: string
    @Column({ type: 'uuid' }) knowledgebaseId: string
    @ManyToOne(() => Knowledgebase, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'knowledgebaseId' }) knowledgebase: Knowledgebase
}
