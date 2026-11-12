import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import type { IArtifactUseGrant, IArtifactUseGrantAudit } from '@xpert-ai/contracts'
import { Column, Entity, Index } from 'typeorm'

@Entity('artifact_use_grant')
@Index('IDX_artifact_use_grant_target', ['tenantId', 'organizationId', 'targetGroupId', 'targetProjectId'])
@Index('IDX_artifact_use_grant_source', ['tenantId', 'organizationId', 'artifactId'])
export class ArtifactUseGrant extends TenantOrganizationBaseEntity implements IArtifactUseGrant {
    @Column({ type: 'uuid' }) artifactId: string
    @Column({ type: 'uuid' }) versionId: string
    @Column({ type: 'uuid' }) ownerProjectId: string
    @Column({ type: 'uuid' }) targetProjectId: string
    @Column({ type: 'uuid' }) targetGroupId: string
    @Column({ type: 'varchar', default: 'read' }) permission: IArtifactUseGrant['permission']
    @Column({ type: 'jsonb', nullable: true }) analysis?: IArtifactUseGrant['analysis']
    @Column({ type: 'varchar', default: 'offered' }) status: IArtifactUseGrant['status']
    @Column({ type: 'int', default: 1 }) revision: number
    @Column({ type: 'uuid' }) issuedById: string
    @Column({ type: 'uuid', nullable: true }) acceptedById?: string | null
    @Column({ type: 'timestamptz', nullable: true }) acceptedAt?: Date | null
    @Column({ type: 'uuid', nullable: true }) closedById?: string | null
    @Column({ type: 'timestamptz', nullable: true }) closedAt?: Date | null
    @Column({ type: 'timestamptz' }) expiresAt: Date
}

@Entity('artifact_use_grant_audit')
@Index('IDX_artifact_use_grant_audit_scope', ['tenantId', 'organizationId', 'grantId', 'createdAt'])
export class ArtifactUseGrantAudit extends TenantOrganizationBaseEntity implements IArtifactUseGrantAudit {
    @Column({ type: 'uuid' }) grantId: string
    @Column({ type: 'uuid' }) actorId: string
    @Column({ type: 'varchar' }) event: IArtifactUseGrantAudit['event']
    @Column({ type: 'int' }) revision: number
}
