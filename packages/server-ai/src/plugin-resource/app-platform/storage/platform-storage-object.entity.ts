import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index } from 'typeorm'

/** Unknown provider outcomes retain their bytes until a confirmed overwrite or deletion. */
@Entity('app_platform_storage_object')
@Index(['tenantId', 'keyDigest'], { unique: true })
@Index(['tenantId', 'userId'])
export class AppPlatformStorageObject extends TenantOrganizationBaseEntity {
    @Column({ type: 'uuid' }) userId: string
    @Column({ type: 'varchar', length: 64 }) keyDigest: string
    @Column({ type: 'varchar' }) provider: string
    @Column({ type: 'text' }) key: string
    @Column({
        type: 'bigint',
        transformer: {
            to: (value: number) => value,
            from: (value: string) => Number(value)
        }
    })
    bytes: number
    @Column({ type: 'boolean', default: false }) confirmed: boolean
}

/** Retain ownership of files even when their business metadata has been removed. */
@Entity('app_platform_storage_root')
@Index(['tenantId', 'pathSuffix'], { unique: true })
export class AppPlatformStorageRoot extends TenantOrganizationBaseEntity {
    @Column({ type: 'uuid' }) userId: string
    @Column({ type: 'varchar', length: 512 }) pathSuffix: string
}
