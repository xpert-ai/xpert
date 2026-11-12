import { Column, Entity, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm'

/** Identifiers, revisions and a query digest only; never persist result cells in the audit. */
@Entity('resource_analysis_execution', { synchronize: false })
@Index('IDX_resource_analysis_execution_scope', ['tenantId', 'organizationId', 'groupId', 'executionId'])
export class ResourceAnalysisExecution {
    @PrimaryGeneratedColumn('uuid') id: string
    @Column({ type: 'uuid' }) tenantId: string
    @Column({ type: 'uuid' }) organizationId: string
    @Column({ type: 'uuid' }) grantId: string
    @Column({ type: 'uuid' }) referenceId: string
    @Column({ type: 'uuid' }) groupId: string
    @Column({ type: 'uuid' }) actorId: string
    @Column({ type: 'uuid' }) assistantId: string
    @Column({ type: 'uuid' }) executionId: string
    @Column({ type: 'int' }) grantRevision: number
    @Column({ type: 'varchar', length: 128 }) datasetKey: string
    @Column({ type: 'varchar', length: 64 }) queryHash: string
    @Column({ type: 'varchar' }) status: 'running' | 'succeeded' | 'denied'
    @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date
}
