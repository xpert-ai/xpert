import type { TemplateInstallationStage, TemplateDependencyLock } from '@xpert-ai/contracts'
import { templateDependencyLocksSchema } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index } from 'typeorm'
import type { InstallationInput } from './template-installation.schema'

@Entity('template_installation')
@Index('IDX_template_installation_request', ['tenantId', 'organizationId', 'userId', 'idempotencyKey'], {
    unique: true
})
@Index('IDX_template_installation_workspace', ['tenantId', 'organizationId', 'userId', 'workspaceId', 'createdAt'])
export class TemplateInstallationEntity extends TenantOrganizationBaseEntity {
    @Column({ type: 'uuid' }) userId: string
    @Column({ type: 'uuid' }) workspaceId: string
    @Column({ type: 'varchar', length: 128 }) idempotencyKey: string
    @Column({ type: 'varchar', length: 64 }) requestHash: string
    @Column({ type: 'varchar', length: 64 }) sourceHash: string
    @Column({
        type: 'jsonb',
        nullable: true,
        transformer: {
            to: (value: TemplateDependencyLock[] | null) => value,
            from: (value: unknown) => (value == null ? null : templateDependencyLocksSchema.parse(value))
        }
    })
    dependencyLocks: TemplateDependencyLock[] | null
    @Column({ type: 'varchar', length: 40 }) language: string
    @Column({ type: 'jsonb' }) input: InstallationInput
    /** Reserved before importing, including before the first Assistant INSERT. */
    @Column({ type: 'uuid' }) assistantId: string
    @Column({ type: 'boolean', default: false }) imported: boolean
    @Column({ type: 'boolean', default: false }) publicationCompleted: boolean
    @Column({ type: 'varchar', length: 24 }) status: 'running' | 'failed' | 'succeeded'
    @Column({ type: 'varchar', length: 24 }) stage: TemplateInstallationStage
    @Column({ type: 'int', default: 0 }) attempt: number
    @Column({ type: 'varchar', length: 32, nullable: true }) errorCode: 'INSTALL_FAILED' | 'SOURCE_CHANGED' | null
    @Column({ type: 'jsonb', default: () => "'[]'::jsonb" }) resourceInstallationIds: string[]
    @Column({ type: 'jsonb', default: () => "'[]'::jsonb" }) pendingAuthInstallationIds: string[]
}
