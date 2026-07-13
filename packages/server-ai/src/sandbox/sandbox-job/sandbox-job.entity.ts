import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import type { SandboxJobErrorCode, SandboxJobOutput, SandboxJobStatus } from '@xpert-ai/plugin-sdk'
import { Column, Entity, Index } from 'typeorm'

/**
 * Provider-neutral execution evidence for a Sandbox Job.
 *
 * Plugin business status remains in plugin entities; this record exists for
 * idempotency, reattachment, audit, cancellation, and orphan cleanup.
 */
@Entity('sandbox_job')
@Index(['tenantId', 'idempotencyKey'], { unique: true })
@Index(['tenantId', 'status', 'hardDeadlineAt'])
@Index(['tenantId', 'businessResourceType', 'businessResourceId'])
export class SandboxJobEntity extends TenantOrganizationBaseEntity {
    @Column({ type: 'varchar' })
    runtimeProfile: string

    @Column({ type: 'varchar' })
    sandboxRuntimeVersion: string

    @Column({ type: 'varchar' })
    action: string

    @Column({ type: 'varchar' })
    actionVersion: string

    @Column({ type: 'varchar' })
    idempotencyKey: string

    @Column({ type: 'varchar' })
    pluginName: string

    @Column({ type: 'varchar' })
    businessResourceType: string

    @Column({ type: 'varchar' })
    businessResourceId: string

    @Column({ type: 'varchar', nullable: true })
    userId?: string | null

    @Column({ type: 'varchar' })
    status: SandboxJobStatus

    @Column({ type: 'int', default: 0 })
    attempt: number

    @Column({ type: 'varchar', nullable: true })
    provider?: string | null

    @Column({ type: 'varchar', nullable: true })
    runtimeBindingId?: string | null

    @Column({ type: 'varchar', nullable: true })
    runtimeArtifactKind?: 'oci-image' | 'filesystem' | 'remote-runtime' | null

    @Column({ type: 'text', nullable: true })
    runtimeArtifactReference?: string | null

    @Column({ type: 'varchar', nullable: true })
    runtimeArtifactDigest?: string | null

    @Column({ type: 'varchar', nullable: true })
    runtimeRef?: string | null

    /** @deprecated Read-only compatibility evidence. New attempts write runtimeRef. */
    @Column({ type: 'varchar', nullable: true })
    containerRef?: string | null

    @Column({ type: 'boolean', default: false })
    cleanupPending: boolean

    @Column({ type: 'timestamptz', nullable: true })
    cleanedAt?: Date | null

    @Column({ type: 'json', nullable: true })
    outputs?: SandboxJobOutput[] | null

    @Column({ type: 'varchar', nullable: true })
    errorCode?: SandboxJobErrorCode | null

    @Column({ type: 'text', nullable: true })
    errorMessage?: string | null

    @Column({ type: 'timestamptz', nullable: true })
    startedAt?: Date | null

    @Column({ type: 'timestamptz', nullable: true })
    finishedAt?: Date | null

    @Column({ type: 'timestamptz', nullable: true })
    hardDeadlineAt?: Date | null
}
