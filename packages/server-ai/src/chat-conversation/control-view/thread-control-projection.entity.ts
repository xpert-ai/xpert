// A per-thread version orders evidence changes as well as control intents. No business payloads or grants are cached.
import type { IThreadControlProjection } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index } from 'typeorm'

@Entity('chat_thread_control_projection')
@Index('IDX_thread_control_projection_thread', ['threadId'], { unique: true })
export class ThreadControlProjection extends TenantOrganizationBaseEntity implements IThreadControlProjection {
    declare id: string
    declare tenantId: string
    @Column({ type: 'varchar', length: 100 }) threadId: string
    @Column({ type: 'bigint', default: 1 }) revision: string
    @Column({ type: 'varchar', length: 64 }) fingerprint: string
}
